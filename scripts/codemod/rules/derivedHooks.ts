// usePrevious / usePreviousDeprecated → previous(() => x), useCurrentOrPrev → currentOrPrev, useFrozenProps → frozenWhile.
// Each returns an accessor (the accessorReads rule adds the calls).
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import { type Ctx, isGlobalRef } from '../context.ts';

const thunk = (ctx: Ctx, arg: t.Node): string => ctx.thunk(arg);

function isLiteral(node: t.Node | undefined, value: boolean): boolean {
  return Boolean(node) && node.type === 'BooleanLiteral' && node.value === value;
}

export const derivedHooksRule: Rule = {
  name: 'derivedHooks',
  description: 'usePrevious*/useCurrentOrPrev/useFrozenProps → previous/currentOrPrev/frozenWhile',
  run(ctx: Ctx) {
    ctx.program.traverse({
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.get('callee');
        if (!callee.isIdentifier()) return;
        const name = callee.node.name;
        const rawArgs: t.Node[] = path.node.arguments;
        if (!rawArgs[0] || rawArgs.some((a) => a.type === 'SpreadElement')) return;
        const args = rawArgs as t.Expression[];
        switch (name) {
          case 'usePrevious':
          case 'usePreviousDeprecated': {
            if (!isGlobalRef(callee, name)) return;
            const options = args[1] && !isLiteral(args[1], false) ? `, { skipUndefined: ${ctx.text(args[1])} }` : '';
            ctx.overwrite(path.node, `previous(${thunk(ctx, args[0])}${options})`);
            ctx.hit(name);
            return;
          }
          case 'useCurrentOrPrev': {
            if (!isGlobalRef(callee, name)) return;
            const fields: string[] = [];
            if (args[1] && !isLiteral(args[1], false)) fields.push(`skipUndefined: ${ctx.text(args[1])}`);
            if (args[2] && !isLiteral(args[2], false)) fields.push(`forceCurrent: ${thunk(ctx, args[2])}`);
            ctx.overwrite(
              path.node,
              `currentOrPrev(${thunk(ctx, args[0])}${fields.length ? `, { ${fields.join(', ')} }` : ''})`,
            );
            ctx.hit(name);
            return;
          }
          case 'useFrozenProps': {
            if (!isGlobalRef(callee, name)) return;
            if (args[2]) {
              ctx.todo(
                path.node,
                'frozen-fresh-keys',
                'useFrozenProps alwaysFreshKeys has no mapping (frozenWhile freezes the whole object)',
              );
            }
            ctx.overwrite(
              path.node,
              `frozenWhile(${thunk(ctx, args[0])}, ${args[1] ? thunk(ctx, args[1]) : '() => false'})`,
            );
            ctx.hit(name);
            return;
          }
          default:
        }
      },
    });
  },
};
