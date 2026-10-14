// `createEffect` compares the value its compute returns with `!==`; teact compared a dependency array element by element.
// A compute that returns a new array each run (`() => [delay(), noFirst]`) re-applies the effect on every run of the
// compute even when every element is unchanged: `useInterval`'s timer was reset (and its callback fired) on each tick of
// the signal its delay was derived from, and `RoundTimer` ran out in one second. The array becomes
// `depsOf(() => [...])` (src/util/effectDeps.ts), which returns the previous array while the elements are `Object.is`-equal.
// Idempotent: an already wrapped compute (not an arrow) is left alone.
import type * as t from '@babel/types';

import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

const EFFECTS = new Set(['createEffect', 'createMeasureEffect', 'createMutationEffect', 'createIdleEffect']);

export const effectDepsRule: Rule = {
  name: 'effectDeps',
  description: 'effect computes that return an array → depsOf(() => [...]) (compare by value)',
  run(ctx: Ctx) {
    ctx.program.traverse({
      CallExpression(path) {
        const callee = path.node.callee;
        if (callee.type !== 'Identifier' || !EFFECTS.has(callee.name)) return;
        const compute = path.node.arguments[0];
        if (!compute || compute.type !== 'ArrowFunctionExpression' || compute.params.length) return;
        let body: t.Node = compute.body;
        while (body.type === 'ParenthesizedExpression' || body.type === 'TSAsExpression') {
          body = body.type === 'ParenthesizedExpression' ? body.expression : body.expression;
        }
        if (body.type !== 'ArrayExpression') return;
        const text = ctx.text(compute.body);
        ctx.overwrite(compute, `depsOf(() => ${text})`);
        ctx.hit('depsOf');
      },
    });
  },
};
