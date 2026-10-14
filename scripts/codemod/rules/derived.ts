// A component body runs once. A `const x = <expression over props / signals>` was recomputed on every teact render;
// here it becomes `const x = createMemo(() => …)` and its reads `x()`. A destructuring of a reactive object
// (`const { a, b = 1 } = props.notification`) becomes one accessor per field. Any other body-level statement that reads
// reactive values (an `if` that is not a trailing early return, an assignment) gets a TODO: it needs an effect or a memo.
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import {
  bodyStatements,
  classifyBindings,
  collectPropKinds,
  findBodies,
  isPrimitiveCallStatement,
  isReactiveExpr,
  type Kinds,
  rewriteReads,
  type RunOnceBody,
} from '../analysis.ts';
import { calleeName, type Ctx } from '../context.ts';
import { trailingEarlyReturns } from './earlyReturn.ts';

const ACCESSOR_CALLEES = new Set(['createMemo', 'previous', 'currentOrPrev', 'frozenWhile']);

function sourceName(init: t.Expression): string {
  const callee = init.type === 'CallExpression' ? calleeName(init) : undefined;
  if (callee === 'frozenWhile') return 'frozen';
  if (callee) {
    return `${callee.replace(/^(use|create)/, '').replace(/^[A-Z]/, (c) => c.toLowerCase()) || 'value'}Result`;
  }
  return 'source';
}

function rewriteDestructuring(
  ctx: Ctx,
  statement: NodePath<t.VariableDeclaration>,
  declarator: t.VariableDeclarator,
  kinds: Kinds,
): boolean {
  const pattern = declarator.id as t.ObjectPattern;
  const init = declarator.init!;
  const entries: { key: string; local: string; def?: t.Expression }[] = [];
  for (const property of pattern.properties) {
    if (property.type === 'RestElement') return false;
    if (property.computed || property.key.type !== 'Identifier') return false;
    let value = property.value;
    let def: t.Expression | undefined;
    if (value.type === 'AssignmentPattern') {
      def = value.right;
      value = value.left;
    }
    if (value.type !== 'Identifier') return false;
    entries.push({ key: property.key.name, local: value.name, def });
  }
  const indent = ctx.indentOf(statement.node);
  const lines: string[] = [];
  let source: string;
  const callee = init.type === 'CallExpression' ? calleeName(init) : undefined;
  const propsName = [...kinds.byName].find(([, kind]) => kind === 'props')?.[0];
  const isPropsChain = (node: t.Node): boolean =>
    (node.type === 'Identifier' && node.name === propsName) ||
    (node.type === 'MemberExpression' && !node.computed && isPropsChain(node.object));
  if (isPropsChain(init)) {
    // `const { a } = props.notification` → `const a = () => props.notification.a`
    source = ctx.text(init);
    ctx.removeStatement(statement.node);
    ctx.insertBefore(ctx.lineStart(statement.node.start!), '');
  } else {
    // Hoist the source behind an accessor; the init text stays in place so edits inside it (renames) survive.
    const name = ctx.scope.generateUid(sourceName(init)).replace(/^_/, '');
    const accessor = init.type === 'CallExpression' && callee && ACCESSOR_CALLEES.has(callee);
    const [prefix, suffix] = ctx.memoWrap(init);
    ctx.overwrite([statement.node.start!, init.start!], `const ${name} = ${accessor ? '' : prefix}`);
    ctx.overwrite([init.end!, statement.node.end!], `${accessor ? '' : suffix};`);
    source = `${name}()`;
  }
  for (const entry of entries) {
    const read = `${source}.${entry.key}`;
    lines.push(`const ${entry.local} = () => ${entry.def ? `${read} ?? ${ctx.textWithParens(entry.def)}` : read};`);
  }
  if (isPropsChain(init)) {
    ctx.ms.appendLeft(ctx.lineStart(statement.node.start!), `${indent}${lines.join(`\n${indent}`)}\n`);
  } else {
    ctx.insertAfter(statement.node.end!, `\n${indent}${lines.join(`\n${indent}`)}`);
  }
  for (const entry of entries) {
    const binding = kinds.bindings.get(entry.local) ?? statement.scope.getBinding(entry.local);
    if (!binding) continue;
    const count = rewriteReads(ctx, binding, `${entry.local}()`);
    if (count) ctx.hit('derivedRead', count);
  }
  ctx.hit('derivedDestructure', entries.length);
  return true;
}

function rewriteBody(ctx: Ctx, body: RunOnceBody, kinds: Kinds): void {
  const statements = bodyStatements(body);
  const trailing = new Set<t.Node>(trailingEarlyReturns(ctx, body, kinds).map((s) => s.node));
  for (const statement of statements) {
    const node = statement.node;
    if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        const init = declarator.init;
        if (!init) continue;
        if (declarator.id.type === 'Identifier') {
          const kind = kinds.byName.get(declarator.id.name);
          if (kind !== 'reactive') continue;
          if (node.kind !== 'const') {
            ctx.todo(
              node,
              'reactive-let',
              `"${declarator.id.name}" is computed once from reactive values; make it a memo or a signal`,
            );
            continue;
          }
          if (node.declarations.length !== 1) {
            ctx.todo(node, 'reactive-multi', 'reactive consts in a multi-declarator statement');
            continue;
          }
          const annotation = declarator.id.typeAnnotation;
          const [initStart, initEnd] = ctx.rangeWithParens(init);
          const generic = annotation ? `<${ctx.text((annotation as t.TSTypeAnnotation).typeAnnotation)}>` : '';
          if (annotation) ctx.remove(annotation.start!, annotation.end!);
          const [prefix, suffix] = ctx.memoWrap(init, generic);
          ctx.insertBefore(initStart, prefix);
          ctx.insertAfter(initEnd, suffix);
          const binding = kinds.bindings.get(declarator.id.name);
          if (binding) {
            const count = rewriteReads(ctx, binding, `${declarator.id.name}()`);
            if (count) ctx.hit('derivedRead', count);
            for (const violation of binding.constantViolations) {
              ctx.todo(violation.node, 'reactive-assign', `"${declarator.id.name}" is a memo now and is assigned here`);
            }
          }
          ctx.hit('derivedMemo');
        } else if (declarator.id.type === 'ObjectPattern') {
          const names = declarator.id.properties
            .map((p) =>
              p.type === 'ObjectProperty'
                ? p.value.type === 'Identifier'
                  ? p.value.name
                  : p.value.type === 'AssignmentPattern' && p.value.left.type === 'Identifier'
                    ? p.value.left.name
                    : undefined
                : undefined,
            )
            .filter(Boolean) as string[];
          if (!names.some((name) => kinds.byName.get(name) === 'reactive')) continue;
          if (
            node.declarations.length !== 1 ||
            !rewriteDestructuring(ctx, statement as NodePath<t.VariableDeclaration>, declarator, kinds)
          ) {
            ctx.todo(
              node,
              'reactive-pattern',
              'destructuring of a reactive object with a nested/rest pattern: read the fields through accessors',
            );
          }
        } else if (declarator.id.type === 'ArrayPattern' && isReactiveExpr(ctx, init, kinds)) {
          const callee = init.type === 'CallExpression' ? calleeName(init) : undefined;
          if (callee && /^(use|create)[A-Z]/.test(callee)) continue;
          ctx.todo(
            node,
            'reactive-pattern',
            'array destructuring of a reactive value: read the items through accessors',
          );
        }
      }
      continue;
    }
    if (node.type === 'ReturnStatement' || trailing.has(node)) continue;
    if (isPrimitiveCallStatement(node)) continue;
    if (node.type === 'FunctionDeclaration' || node.type === 'TSTypeAliasDeclaration') continue;
    if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression') {
      const name = calleeName(node.expression);
      if (name && /^(use|create)[A-Z]/.test(name)) continue;
    }
    if (isReactiveExpr(ctx, node, kinds)) {
      ctx.todo(
        node,
        'runs-once',
        'this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo',
      );
    }
  }
}

/** store contract §12.4: `getGlobal()` in JSX or in a memo callback is a one-time read; it should be `useGlobal()`. */
function flagGetGlobalInTracked(ctx: Ctx): void {
  ctx.program.traverse({
    CallExpression(path) {
      const callee = path.node.callee;
      if (callee.type !== 'Identifier' || callee.name !== 'getGlobal') return;
      const tracked = path.findParent(
        (p) =>
          p.isJSXExpressionContainer() ||
          (p.isCallExpression() &&
            p.node.callee.type === 'Identifier' &&
            (p.node.callee.name === 'createMemo' || p.node.callee.name === 'useMemo')),
      );
      if (!tracked) return;
      if (
        tracked.isJSXExpressionContainer() &&
        path.findParent((p) => p.isFunction() && p.node.start! > tracked.node.start!)
      ) {
        return; // inside a handler written in JSX (`onClick={() => getGlobal()…}`): an event-time read
      }
      ctx.todo(
        path.node,
        'getGlobal-tracked',
        'getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)',
      );
    },
  });
}

export const derivedRule: Rule = {
  name: 'derived',
  description:
    'body consts over props/signals → createMemo (+ reads x()); reactive destructuring → accessors; run-once TODOs',
  run(ctx: Ctx) {
    const propKinds = collectPropKinds(ctx);
    for (const body of findBodies(ctx)) {
      if (!body.body) continue;
      const kinds = classifyBindings(ctx, body, propKinds);
      rewriteBody(ctx, body, kinds);
    }
    flagGetGlobalInTracked(ctx);
  },
};
