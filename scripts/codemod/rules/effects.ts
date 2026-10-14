// Effects have two halves in frameact. `useEffect(fn, deps)` → `createEffect(() => deps, fn)` (the deps are the tracked
// compute, the old body is the untracked apply and may return its cleanup). `[]` → `onMount(fn)`,
// `useUnmountCleanup` → `onDestroy`, `useLayoutEffect` → `createMutationEffect`, a body that reads layout →
// `createMeasureEffect` (porting guide §4.5). `*WithPrevDeps` get `prev` from apply's second argument.
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import {
  classifyBindings,
  collectPropKinds,
  collectPropTypes,
  containerDeps,
  findBodies,
  isFunctionNode,
  type Kinds,
  rewriteReads,
} from '../analysis.ts';
import { type Ctx, isGlobalRef } from '../context.ts';

const LAYOUT_READ =
  /\b(getBoundingClientRect|offset(?:Width|Height|Top|Left)|client(?:Width|Height|Top|Left)|scroll(?:Height|Width)|scrollTop\b(?!\s*=)|scrollLeft\b(?!\s*=)|getComputedStyle|scrollIntoView|\.focus\(\)|innerWidth|innerHeight|getClientRects|matches\()/;

type Facade = 'createEffect' | 'createMeasureEffect' | 'createMutationEffect';

const HOOKS: Record<string, { facade: Facade | 'auto'; prevDeps: boolean; sync?: boolean }> = {
  useEffect: { facade: 'auto', prevDeps: false },
  useLayoutEffect: { facade: 'createMutationEffect', prevDeps: false },
  useEffectWithPrevDeps: { facade: 'auto', prevDeps: true },
  useLayoutEffectWithPrevDeps: { facade: 'createMutationEffect', prevDeps: true },
  useSyncEffect: { facade: 'auto', prevDeps: true, sync: true },
  useSyncEffectWithPrevDeps: { facade: 'auto', prevDeps: true, sync: true },
};

function depsText(ctx: Ctx, deps: t.ArrayExpression, keepArray: boolean, asConst: boolean): string {
  const elements = deps.elements.filter(Boolean) as t.Node[];
  if (!keepArray && elements.length === 1 && elements[0].type !== 'SpreadElement') {
    return ctx.textWithParens(elements[0]);
  }
  // A tuple, so that the destructured parameter of the apply half keeps the type of each dependency (an array literal
  // of mixed types widens to a union array).
  return asConst && elements.length > 1 ? `${ctx.text(deps)} as const` : ctx.text(deps);
}

/**
 * Dependencies that are accessors (signals, memos, flags, reactive consts) are received as VALUES by the apply half:
 * `createEffect(() => [isOpen], ([isOpen]) => …)`. The parameter shadows the accessor, so the body keeps reading the
 * value it was written for (teact's closure semantics) and TypeScript narrows it.
 */
function shadowedDeps(deps: t.ArrayExpression, kinds: Kinds | undefined): string[] | undefined {
  const names: string[] = [];
  let any = false;
  for (const element of deps.elements) {
    // `props.error`: a prop read in the apply half would evaluate the prop getter there, and a getter that the compiler
    // wrapped in a memo (a conditional / logical expression at the call site) cannot be read in an apply (no owner).
    if (
      element?.type === 'MemberExpression' &&
      !element.computed &&
      element.object.type === 'Identifier' &&
      element.object.name === 'props' &&
      element.property.type === 'Identifier' &&
      !names.includes(`props.${element.property.name}`)
    ) {
      names.push(`props.${element.property.name}`);
      any = true;
      continue;
    }
    if (kinds && element?.type === 'Identifier' && !names.includes(element.name)) {
      const kind = kinds.byName.get(element.name);
      if (kind === 'accessor' || kind === 'reactive' || kind === 'thunk') {
        names.push(element.name);
        any = true;
        continue;
      }
    }
    names.push('');
  }
  if (!any) return undefined;
  while (names.length && names[names.length - 1] === '') names.pop();
  return names;
}

/** `props.error` → `error2`, `isOpen` → `isOpen2` (tt's `no-shadow` is on: the parameter cannot reuse the name). */
const paramName = (dep: string) => `${dep.startsWith('props.') ? dep.slice(6) : dep}2`;

export const effectsRule: Rule = {
  name: 'effects',
  description: 'useEffect family → createEffect/createMeasureEffect/createMutationEffect/onMount/onDestroy',
  run(ctx: Ctx) {
    const propKinds = collectPropKinds(ctx);
    const propTypes = collectPropTypes(ctx);
    const bodies = findBodies(ctx);
    const kindsByFn = new Map<t.Node, Kinds>(
      bodies.map((body) => [body.fn.node, classifyBindings(ctx, body, propKinds)]),
    );
    /** `[handleClick, lang]`: every dependency is a function or a static of the body, so the effect ran once. */
    const isStaticDeps = (path: NodePath, deps: t.ArrayExpression): boolean => {
      const owner = path.findParent((p) => kindsByFn.has(p.node));
      const kinds: Kinds | undefined = owner ? kindsByFn.get(owner.node) : undefined;
      if (!kinds) return false;
      return deps.elements.every((element) => {
        if (!element || element.type !== 'Identifier') return false;
        const kind = kinds.byName.get(element.name);
        return kind === 'callback' || kind === 'static' || kind === 'lang' || kind === 'hook';
      });
    };
    ctx.program.traverse({
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.get('callee');
        if (!callee.isIdentifier()) return;
        const name = callee.node.name;
        const call = path.node;
        const args = call.arguments;
        const fn = args[0];
        if (!fn || fn.type === 'SpreadElement' || fn.type === 'ArgumentPlaceholder') return;

        if (name === 'useEffectOnce' && isGlobalRef(callee, name)) {
          ctx.overwrite(callee.node, 'onMount');
          ctx.hit('onMount');
          return;
        }
        if (name === 'useUnmountCleanup' && isGlobalRef(callee, name)) {
          ctx.overwrite(callee.node, 'onDestroy');
          ctx.hit('onDestroy');
          return;
        }
        const spec = HOOKS[name];
        if (!spec || !isGlobalRef(callee, name)) return;

        const deps = args[1];
        const fnNode = fn;
        const isEmptyDeps =
          deps?.type === 'ArrayExpression' && (deps.elements.length === 0 || isStaticDeps(path, deps));

        // `([prevA, prevB]) => …` → `(_deps, prev) => { const [prevA, prevB] = prev ?? []; … }`
        const prevParam =
          spec.prevDeps && isFunctionNode(fnNode) ? (fnNode as t.ArrowFunctionExpression).params[0] : undefined;
        const rewritePrevParam = () => {
          if (!prevParam) return true;
          const arrow = fnNode as t.ArrowFunctionExpression | t.FunctionExpression;
          if (arrow.body.type !== 'BlockStatement') {
            ctx.todo(call, 'prev-deps-shape', `${name} callback with prev deps must have a block body`);
            return false;
          }
          if (isEmptyDeps) {
            ctx.overwrite(prevParam, '');
            return true;
          }
          ctx.overwrite(prevParam, '_deps, prev');
          const first = arrow.body.body[0];
          const indent = first ? ctx.indentOf(first) : `${ctx.indentOf(call)}  `;
          ctx.insertAfter(arrow.body.start! + 1, `\n${indent}const ${ctx.text(prevParam)} = prev ?? [];`);
          return true;
        };

        if (isEmptyDeps) {
          if (!rewritePrevParam()) return;
          ctx.overwrite(callee.node, 'onMount');
          ctx.remove(fnNode.end!, args[args.length - 1].end!);
          ctx.hit(name === 'useLayoutEffect' ? 'onMountFromLayout' : 'onMount');
          if (spec.sync) {
            ctx.todo(
              call,
              'sync-effect',
              `${name}(…, []) ran during the first render; onMount runs after attach (measure phase)`,
            );
          }
          return;
        }

        if (!deps || deps.type !== 'ArrayExpression') {
          ctx.overwrite(callee.node, 'createEffect');
          ctx.insertBefore(fnNode.start!, '() => undefined, ');
          ctx.todo(
            call,
            'no-deps',
            `${name} without a dependency array ran after every render: name the tracked reads in the compute half`,
          );
          ctx.hit('effectNoDeps');
          return;
        }

        if (!rewritePrevParam()) return;
        {
          const owner = path.findParent((p) => kindsByFn.has(p.node));
          const containers = containerDeps(ctx, deps, propTypes, owner ? kindsByFn.get(owner.node) : undefined);
          if (containers.length) {
            ctx.todo(
              call,
              'identity-dep',
              `dependency on a container (${containers.join(', ')}) keeps its identity while its content changes: track the fields the effect reads instead (store contract §12.7)`,
            );
          }
        }
        let facade: Facade = spec.facade === 'auto' ? 'createEffect' : spec.facade;
        if (spec.facade === 'auto' && LAYOUT_READ.test(ctx.text(fnNode))) facade = 'createMeasureEffect';
        ctx.overwrite(callee.node, facade);
        const owner = path.findParent((p) => kindsByFn.has(p.node));
        const shadowed = shadowedDeps(deps, owner ? kindsByFn.get(owner.node) : undefined);
        const keepArray = Boolean(prevParam) || Boolean(shadowed && (shadowed.length > 1 || deps.elements.length > 1));
        ctx.insertBefore(fnNode.start!, `() => ${depsText(ctx, deps, keepArray, Boolean(shadowed) && !prevParam)}, `);
        ctx.remove(fnNode.end!, args[args.length - 1].end!);
        if (shadowed && isFunctionNode(fnNode) && !prevParam) {
          const arrow = fnNode as t.ArrowFunctionExpression | t.FunctionExpression;
          // The parameter is `name2`, not `name`: tt's `no-shadow` is on. The reads of the accessor inside the callback
          // become reads of the parameter (the value the compute half returned), so TypeScript still narrows them.
          const renamed = shadowed.map((dep) => (dep ? paramName(dep) : dep));
          const pattern = keepArray ? `[${renamed.join(', ')}]` : renamed[0];
          if (arrow.params.length === 0) {
            const open = ctx.code.indexOf('(', arrow.start!);
            if (open !== -1 && open < arrow.body.start!) {
              ctx.insertAfter(open + 1, pattern);
              const insideCallback = (node: t.Node) => node.start! >= arrow.start! && node.end! <= arrow.end!;
              for (const dep of shadowed.filter(Boolean)) {
                if (dep.startsWith('props.')) {
                  const prop = dep.slice(6);
                  path.traverse({
                    MemberExpression(member) {
                      const node = member.node;
                      if (!insideCallback(node) || node.computed) return;
                      if (node.object.type !== 'Identifier' || node.object.name !== 'props') return;
                      if (node.property.type !== 'Identifier' || node.property.name !== prop) return;
                      // an assignment target (`props.x = …`) is not a read
                      if (member.parentPath.isAssignmentExpression({ left: node })) return;
                      ctx.overwrite(node, paramName(dep));
                    },
                  });
                  continue;
                }
                const binding = path.scope.getBinding(dep);
                if (!binding) continue;
                rewriteReads(ctx, binding, paramName(dep), { filter: (ref) => insideCallback(ref.node) });
              }
            }
          }
          ctx.hit('effectValueDeps');
        }
        if (spec.sync) {
          ctx.todo(
            call,
            'sync-effect',
            `${name} ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update`,
          );
        }
        ctx.hit(facade);
      },
    });
  },
};
