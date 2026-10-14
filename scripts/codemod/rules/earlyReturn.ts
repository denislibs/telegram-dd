// The body runs once, so `if (!x) return undefined; return <div/>` must become `<Show when={x}><div/></Show>`.
// Only the trailing chain (if-returns directly before the final return) is rewritten; an early return higher up
// gets a TODO from the derived rule ("runs once").
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

import {
  bodyStatements,
  classifyBindings,
  collectPropKinds,
  findBodies,
  isReactiveExpr,
  type Kinds,
  type RunOnceBody,
} from '../analysis.ts';

function returnOf(statement: t.Statement): t.ReturnStatement | undefined {
  if (statement.type === 'ReturnStatement') return statement;
  if (statement.type === 'BlockStatement' && statement.body.length === 1) return returnOf(statement.body[0]);
  return undefined;
}

/** `if (cond) return X;` statements right before the final `return` of a component body (in order). */
export function trailingEarlyReturns(ctx: Ctx, body: RunOnceBody, kinds: Kinds): NodePath<t.IfStatement>[] {
  if (body.kind !== 'component') return [];
  const statements = bodyStatements(body);
  const last = statements[statements.length - 1];
  if (!last?.isReturnStatement()) return [];
  const chain: NodePath<t.IfStatement>[] = [];
  for (let i = statements.length - 2; i >= 0; i--) {
    const statement = statements[i];
    if (isInert(statement.node, kinds)) continue; // a render helper declared after the early return
    if (!statement.isIfStatement() || statement.node.alternate || !returnOf(statement.node.consequent)) break;
    chain.unshift(statement);
  }
  if (!chain.some((statement) => isReactiveExpr(ctx, statement.node.test, kinds))) return [];
  return chain;
}

/** A function declaration or a const bound to a function / JSX / static value: it can sit below a `<Show>` condition. */
function isInert(statement: t.Statement, kinds: Kinds): boolean {
  if (statement.type === 'FunctionDeclaration') return true;
  if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') return false;
  return statement.declarations.every((declarator) => {
    if (declarator.id.type !== 'Identifier') return false;
    const kind = kinds.byName.get(declarator.id.name);
    return kind === 'callback' || kind === 'static' || kind === 'thunk' || kind === 'accessor';
  });
}

function negate(ctx: Ctx, test: t.Expression): string {
  if (test.type === 'UnaryExpression' && test.operator === '!') return ctx.textWithParens(test.argument);
  if (
    test.type === 'Identifier' ||
    test.type === 'MemberExpression' ||
    test.type === 'CallExpression' ||
    test.type === 'OptionalMemberExpression' ||
    test.type === 'OptionalCallExpression'
  ) {
    return `!${ctx.text(test)}`;
  }
  return `!(${ctx.text(test)})`;
}

function isNothing(node: t.Expression | null | undefined): boolean {
  return !node || (node.type === 'Identifier' && node.name === 'undefined') || node.type === 'NullLiteral';
}

function asJsxChild(ctx: Ctx, node: t.Expression): string {
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return ctx.text(node);
  return `{${ctx.text(node)}}`;
}

export const earlyReturnRule: Rule = {
  name: 'earlyReturn',
  description: 'trailing `if (cond) return X;` before the final return → <Show when fallback>',
  run(ctx: Ctx) {
    const propKinds = collectPropKinds(ctx);
    for (const body of findBodies(ctx)) {
      if (!body.body) continue;
      const kinds = classifyBindings(ctx, body, propKinds);
      const chain = trailingEarlyReturns(ctx, body, kinds);
      if (!chain.length) continue;
      const statements = bodyStatements(body);
      const last = statements[statements.length - 1] as NodePath<t.ReturnStatement>;
      const argument = last.node.argument;
      if (!argument) continue;
      const indent = ctx.indentOf(last.node);
      const opens: string[] = [];
      for (const statement of chain) {
        const returned = returnOf(statement.node.consequent)!.argument;
        const when = negate(ctx, statement.node.test);
        const fallback = isNothing(returned) ? '' : ` fallback={${ctx.textWithParens(returned!)}}`;
        opens.push(`<Show when={${when}}${fallback}>`);
        ctx.removeStatement(statement.node);
      }
      const closes = chain.map(() => '</Show>').reverse();
      const [start, end] = [argument.start!, argument.end!];
      const inner = asJsxChild(ctx, argument);
      const paren = (argument.extra as { parenthesized?: boolean } | undefined)?.parenthesized;
      const nl = `\n${indent}  `;
      if (paren) {
        ctx.overwrite([start, end], `${opens.join(nl)}${nl}${inner}${nl}${closes.join(nl)}`);
      } else {
        ctx.overwrite([start, end], `(${nl}${opens.join(nl)}${nl}${inner}${nl}${closes.join(nl)}\n${indent})`);
      }
      ctx.hit('earlyReturnShow', chain.length);
    }
  },
};
