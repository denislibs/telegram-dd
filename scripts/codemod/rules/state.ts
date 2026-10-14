// useState/useSignal → createSignal, useMemo/useDerivedState/useDerivedSignal → createMemo,
// useCallback/useLastCallback → the plain function (a component runs once: handlers are never stale).
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import { isFunctionNode } from '../analysis.ts';
import { type Ctx, isGlobalRef } from '../context.ts';

function typeParams(node: t.CallExpression): t.TSTypeParameterInstantiation | undefined {
  const any = node as t.CallExpression & {
    typeParameters?: t.TSTypeParameterInstantiation;
    typeArguments?: t.TSTypeParameterInstantiation;
  };
  return any.typeParameters ?? any.typeArguments;
}

/** Remove everything after the first argument (`, deps, debugKey`). */
function dropArgsAfter(ctx: Ctx, call: t.CallExpression, index: number): void {
  const args = call.arguments;
  if (args.length <= index + 1) return;
  ctx.remove(args[index].end!, args[args.length - 1].end!);
}

const BARE_PARENTS = new Set([
  'VariableDeclarator',
  'ExpressionStatement',
  'ObjectProperty',
  'ArrayExpression',
  'ReturnStatement',
  'ArrowFunctionExpression',
  'AssignmentExpression',
  'JSXExpressionContainer',
  'AssignmentPattern',
]);

/** `useLastCallback(fn)` → `fn`; the parentheses stay where a bare arrow would not parse (`… as T`, `a || …`, `(…)()`). */
function unwrapCall(ctx: Ctx, call: t.CallExpression, path: NodePath<t.CallExpression>): void {
  const arg = call.arguments[0];
  const parent = path.parentPath;
  const bare =
    (parent.isCallExpression() && parent.node.callee !== call) ||
    (parent.isConditionalExpression() && parent.node.test !== call) ||
    BARE_PARENTS.has(parent.node.type);
  if (bare || !isFunctionNode(arg)) {
    ctx.remove(call.start!, arg.start!);
    ctx.remove(arg.end!, call.end!);
  } else {
    ctx.overwrite([call.start!, arg.start!], '(');
  }
}

export const stateRule: Rule = {
  name: 'state',
  description: 'useState/useSignal → createSignal, useMemo → createMemo, useCallback/useLastCallback → plain function',
  run(ctx: Ctx) {
    ctx.program.traverse({
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.get('callee');
        if (!callee.isIdentifier()) return;
        const name = callee.node.name;
        const call = path.node;
        const args = call.arguments;
        switch (name) {
          case 'useState':
          case 'useSignal': {
            if (!isGlobalRef(callee, name)) return;
            ctx.overwrite(callee.node, 'createSignal');
            const generics = typeParams(call);
            if (args.length === 0) {
              if (generics && generics.params.length === 1) {
                const param = generics.params[0];
                if (!/\bundefined\b/.test(ctx.text(param))) ctx.insertAfter(param.end!, ' | undefined');
              }
              ctx.insertAfter(call.end! - 1, 'undefined');
            } else {
              const init = args[0];
              if (name === 'useState' && isFunctionNode(init)) {
                // lazy initialiser: run it once
                ctx.insertBefore(init.start!, '(');
                ctx.insertAfter(init.end!, ')()');
              }
              dropArgsAfter(ctx, call, 0);
            }
            ctx.hit(name === 'useState' ? 'useState' : 'useSignal');
            return;
          }
          case 'useMemo':
          case 'useDerivedState':
          case 'useDerivedSignal': {
            if (!isGlobalRef(callee, name)) return;
            const init = args[0];
            if (!init || init.type === 'SpreadElement') return;
            const deps = args[1];
            if (
              name === 'useMemo' &&
              deps?.type === 'ArrayExpression' &&
              deps.elements.length === 0 &&
              isFunctionNode(init)
            ) {
              // computed once: a plain value
              const fn = init as t.ArrowFunctionExpression;
              const single =
                fn.body.type === 'BlockStatement' &&
                fn.body.body.length === 1 &&
                fn.body.body[0].type === 'ReturnStatement'
                  ? fn.body.body[0].argument
                  : fn.body.type !== 'BlockStatement'
                    ? fn.body
                    : undefined;
              if (single) {
                ctx.overwrite(call, ctx.textWithParens(single));
              } else {
                ctx.overwrite([call.start!, init.start!], '(');
                ctx.overwrite([init.end!, call.end!], ')()');
              }
              ctx.hit('useMemoOnce');
              return;
            }
            ctx.overwrite(callee.node, 'createMemo');
            if (!isFunctionNode(init) && init.type !== 'Identifier') {
              ctx.insertBefore(init.start!, '() => ');
            }
            if (name === 'useDerivedState' && args[2]) {
              ctx.todo(
                call,
                'async-derived',
                'useDerivedState(…, isAsync) resolved asynchronously: createMemo is synchronous',
              );
            }
            dropArgsAfter(ctx, call, 0);
            ctx.hit(name);
            return;
          }
          case 'useCallback':
          case 'useLastCallback': {
            if (!isGlobalRef(callee, name)) return;
            if (!args[0] || args[0].type === 'SpreadElement') {
              ctx.todo(call, 'callback-shape', `${name}() without a function argument`);
              return;
            }
            unwrapCall(ctx, call, path);
            ctx.hit(name);
            return;
          }
          default:
        }
      },
    });
  },
};
