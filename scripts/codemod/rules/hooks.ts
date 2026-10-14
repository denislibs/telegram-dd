// The rest of the hooks: the ones with a primitive (`useHeavyAnimation` → `watchHeavyAnimation`), the ones with no safe
// mechanical mapping (`// TODO(codemod)`), and every app hook that is ported in place: those take accessors, so a
// reactive value argument is wrapped as `() => value` (callbacks and functions pass through).
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import {
  bodyStatements,
  classifyBindings,
  collectPropKinds,
  findBodies,
  findPath,
  isFunctionNode,
  isReactiveExpr,
  type Kinds,
  type PropKind,
} from '../analysis.ts';
import { type Ctx, isGlobalRef } from '../context.ts';

const TODO_HOOKS: Record<string, string> = {
  useForceUpdate: 'useForceUpdate: a component runs once; make the changing value a signal and delete the force update',
  useStateRef:
    'useStateRef: a handler reads the current value through the accessor; replace ref.current with the accessor call',
  useSignalEffect: 'useSignalEffect: createEffect(compute, apply) with the signal reads in compute',
  useThrottleForHeavyAnimation: 'useThrottleForHeavyAnimation: throttle with watchHeavyAnimation / onFullyIdle',
  useMountAfterHeavyAnimation: 'useMountAfterHeavyAnimation: deferUntilIdle(scope, () => <Heavy/>, placeholder)',
  usePrevDuringAnimation: 'usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev',
  useModuleLoader:
    'useModuleLoader: lazy(() => loadBundle(bundle).then((m) => ({ default: m.Name }))) rendered inside <Show>',
  useShowTransitionSwap: 'useShowTransitionSwap: build on createShowTransition',
};

/** Hooks that keep their call shape (ported in place with the same signature). */
const KEEP_AS_IS = new Set([
  'useFlag',
  'useLang',
  'useOldLang',
  'useUniqueId',
  'useLangString',
  'useContext',
  // store contract §12.3: the call is unchanged, the result is an accessor
  'useSelector',
  'useShallowSelector',
  'useSelectorSignal',
]);

function isReactiveArg(ctx: Ctx, arg: t.Node, kinds: Kinds, propKinds: Map<string, PropKind>): boolean {
  if (isFunctionNode(arg)) return false;
  if (arg.type === 'Identifier') {
    const kind = kinds.byName.get(arg.name);
    if (kind === 'accessor' || kind === 'reactive') return true;
    if (kind === 'thunk' || kind === 'callback' || kind === 'lang' || kind === 'static' || kind === 'hook') {
      return false;
    }
  }
  return isReactiveExpr(ctx, arg, kinds, { valueOnly: true, propKinds });
}

function thunkArgs(ctx: Ctx, call: t.CallExpression, kinds: Kinds, propKinds: Map<string, PropKind>): number {
  let count = 0;
  for (const arg of call.arguments) {
    if (arg.type === 'SpreadElement' || arg.type === 'ArgumentPlaceholder') continue;
    if (arg.type === 'ObjectExpression') {
      for (const property of arg.properties) {
        if (property.type !== 'ObjectProperty' || property.key.type !== 'Identifier') continue;
        const value = property.value as t.Expression;
        if (!isReactiveArg(ctx, value, kinds, propKinds)) continue;
        if (property.shorthand) ctx.overwrite(property, `${property.key.name}: () => ${property.key.name}`);
        else ctx.overwrite(value, ctx.thunk(value));
        count++;
      }
      continue;
    }
    if (!isReactiveArg(ctx, arg, kinds, propKinds)) continue;
    ctx.overwrite(arg, ctx.thunk(arg));
    count++;
  }
  return count;
}

export const hooksRule: Rule = {
  name: 'hooks',
  description:
    'remaining hooks: primitives (watchHeavyAnimation), TODOs for unmapped ones, accessor arguments for app hooks',
  run(ctx: Ctx) {
    const propKinds = collectPropKinds(ctx);
    for (const body of findBodies(ctx)) {
      if (!body.body) continue;
      if (body.kind === 'hook' && body.fn.node.params.length > 0) {
        ctx.todo(
          body.fn.node,
          'hook-params',
          `${body.name}: a hook runs once; take accessors (() => x) for reactive parameters and return accessors`,
        );
      }
      const kinds = classifyBindings(ctx, body, propKinds);
      const seen = new Set<t.Node>();
      body.body.traverse({
        CallExpression(path: NodePath<t.CallExpression>) {
          if (seen.has(path.node)) return;
          seen.add(path.node);
          const callee = path.get('callee');
          if (!callee.isIdentifier()) return;
          const name = callee.node.name;
          if (!/^use[A-Z]/.test(name) || !isGlobalRef(callee, name)) return;
          const call = path.node;
          if (name === 'useHeavyAnimation') {
            if (call.arguments.length > 2) {
              ctx.todo(
                call,
                'heavy-animation-disabled',
                'useHeavyAnimation(…, isDisabled): watchHeavyAnimation has no disable flag; guard inside the callbacks',
              );
            }
            ctx.overwrite([callee.node.start!, callee.node.end!], 'watchHeavyAnimation');
            if (call.arguments.length > 2) {
              ctx.remove(call.arguments[1].end!, call.arguments[call.arguments.length - 1].end!);
            }
            ctx.hit('watchHeavyAnimation');
            return;
          }
          const todo = TODO_HOOKS[name];
          if (todo) {
            ctx.todo(call, `hook:${name}`, todo);
            return;
          }
          if (KEEP_AS_IS.has(name)) return;
          const thunked = thunkArgs(ctx, call, kinds, propKinds);
          if (thunked) ctx.hit('hookArgAccessor', thunked);
        },
      });
    }
    void bodyStatements;
    void findPath;
  },
};
