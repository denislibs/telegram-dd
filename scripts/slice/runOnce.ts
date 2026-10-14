// Lists reads of `props.x` and of signal/memo accessors that sit directly in a component or hook body (not inside a
// nested function, JSX expression or effect compute): they run once, so they are one-time snapshots. Candidates for a
// manual review (an initial value such as `createSignal(props.x)` is fine). Usage: pnpm exec tsx scripts/slice/runOnce.ts
import { parse } from '@babel/parser';
import { readFileSync } from 'node:fs';
import { globSync } from 'tinyglobby';

const files = globSync(
  process.argv.slice(2).length ? process.argv.slice(2) : ['src/components/**/*.tsx', 'src/hooks/**/*.ts*'],
);
for (const file of files) {
  if (/\.test\./.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  let ast: any;
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });
  } catch {
    continue;
  }
  const accessors = new Set<string>();
  const collect = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(collect);
    if (node.type === 'VariableDeclarator' && node.init?.type === 'CallExpression') {
      const callee = node.init.callee.name;
      if (node.id.type === 'ArrayPattern' && (callee === 'createSignal' || callee === 'useFlag')) {
        if (node.id.elements[0]?.name) accessors.add(node.id.elements[0].name);
      }
      if (
        node.id.type === 'Identifier' &&
        (callee === 'createMemo' || callee === 'previous' || callee === 'currentOrPrev')
      ) {
        accessors.add(node.id.name);
      }
    }
    for (const key of Object.keys(node)) if (key !== 'loc') collect(node[key]);
  };
  collect(ast.program);

  const body = (fn: any) => (fn.body.type === 'BlockStatement' ? fn.body.body : []);
  const isComponent = (fn: any) =>
    fn.params?.[0]?.type === 'Identifier' && /props$/i.test(fn.params[0].name) && fn.body.type === 'BlockStatement';
  const report = (node: any, what: string) => console.log(`${file}:${node.loc.start.line} ${what}`);
  const scanTop = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(scanTop);
    if (/Function|JSX/.test(node.type)) return; // closures, JSX bindings and handlers run later
    if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === 'props') {
      report(node, `props.${node.property.name} read once`);
    }
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      accessors.has(node.callee.name) &&
      !node.arguments.length
    ) {
      report(node, `${node.callee.name}() read once`);
    }
    for (const key of Object.keys(node)) if (key !== 'loc') scanTop(node[key]);
  };
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (
      (node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression') &&
      isComponent(node)
    ) {
      for (const statement of body(node)) scanTop(statement);
    }
    for (const key of Object.keys(node)) if (key !== 'loc') visit(node[key]);
  };
  visit(ast.program);
}
