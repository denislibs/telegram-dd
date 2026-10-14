// Lists functions that call a signal setter and, later in the same function, read the same signal
// (`setX(…); … x() …`): teact's `x` was the closure value from before the write, frameact's `x()` is the new one.
// Usage: pnpm exec tsx scripts/slice/readAfterSet.ts [globs…]
import { parse } from '@babel/parser';
import { readFileSync } from 'node:fs';
import { globSync } from 'tinyglobby';

const files = globSync(
  process.argv.slice(2).length ? process.argv.slice(2) : ['src/components/**/*.tsx', 'src/hooks/**/*.ts'],
);
for (const file of files) {
  if (/\.test\./.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'], errorRecovery: true });
  } catch {
    continue;
  }
  const setters = new Map<string, string>(); // setter -> getter
  const collect = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(collect);
    if (node.type === 'VariableDeclarator' && node.id.type === 'ArrayPattern' && node.init?.type === 'CallExpression') {
      const callee = node.init.callee.name;
      const names = node.id.elements.map((element: any) => element?.name);
      if (callee === 'createSignal' || callee === 'useSignal') setters.set(names[1], names[0]);
      if (callee === 'useFlag') {
        setters.set(names[1], names[0]);
        setters.set(names[2], names[0]);
      }
    }
    for (const key of Object.keys(node)) if (key !== 'loc') collect(node[key]);
  };
  collect(ast.program);
  const calls: { name: string; pos: number; fn: any }[] = [];
  const walk = (node: any, fn: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((child) => walk(child, fn));
    const isFn =
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration';
    const here = isFn ? node : fn;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && fn) {
      const getter = setters.get(node.callee.name);
      if (getter) calls.push({ name: node.callee.name, pos: node.end, fn });
      if (calls.length && !getter) {
        for (const call of calls) {
          if (call.fn === fn && setters.get(call.name) === node.callee.name && node.start > call.pos) {
            console.log(
              `${file}:${node.loc.start.line} ${node.callee.name}() read after ${call.name}(…) in the same function`,
            );
          }
        }
      }
    }
    for (const key of Object.keys(node)) if (key !== 'loc') walk(node[key], here);
  };
  walk(ast.program, undefined);
}
