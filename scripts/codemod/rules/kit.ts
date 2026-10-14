// Transitions and infinite scroll are app-level (src/lib/kit): useShowTransition → createShowTransition,
// useMediaTransition → createMediaTransition (reactive options become accessors); useInfiniteScroll keeps its name but
// takes accessors for `listIds` / `isDisabled` (ported in place, porting guide §4.2).
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import { isFunctionNode } from '../analysis.ts';
import { type Ctx, isGlobalRef } from '../context.ts';

const THUNKED_OPTIONS = new Set(['isOpen', 'noOpenTransition', 'noCloseTransition', 'hasMediaData']);
const RENAMED_OPTIONS: Record<string, string> = { shouldForceOpen: 'forceOpen' };
const RESULT_RENAMES: Record<string, string> = { getIsClosing: 'isClosing' };

const thunk = (ctx: Ctx, node: t.Node): string => ctx.thunk(node);

/** Remove an object property together with its separator (and its line when it stands alone). */
function removeProperty(ctx: Ctx, object: t.ObjectExpression | t.ObjectPattern, index: number): void {
  const props = object.properties as t.Node[];
  const prop = props[index];
  const ls = ctx.lineStart(prop.start!);
  const le = ctx.lineEnd(prop.end!);
  const line = ctx.code.slice(ls, le);
  if (/^[ \t]*$/.test(ctx.code.slice(ls, prop.start!)) && /^,?[ \t]*\n?$/.test(ctx.code.slice(prop.end!, le))) {
    ctx.remove(ls, le);
    return;
  }
  void line;
  if (index + 1 < props.length) ctx.remove(prop.start!, props[index + 1].start!);
  else if (index > 0) ctx.remove(props[index - 1].end!, prop.end!);
  else ctx.remove(prop.start!, prop.end!);
}

function rewriteOptions(ctx: Ctx, object: t.ObjectExpression): void {
  object.properties.forEach((property, index) => {
    if (property.type === 'SpreadElement') {
      ctx.todo(property, 'transition-spread', 'spread into transition options: reactive fields must be accessors');
      return;
    }
    if (property.type !== 'ObjectProperty' || property.key.type !== 'Identifier') return;
    const key = property.key.name;
    if (key === 'withShouldRender') {
      removeProperty(ctx, object, index);
      return;
    }
    if (key === 'ref') {
      ctx.todo(property, 'transition-ref', 'ref option: hand the result `ref` to the element (ref={t.ref}) instead');
      return;
    }
    const renamed = RENAMED_OPTIONS[key];
    const needsThunk = THUNKED_OPTIONS.has(key) || Boolean(renamed);
    if (!needsThunk) return;
    const newKey = renamed ?? key;
    if (property.shorthand) {
      ctx.overwrite(property, `${newKey}: () => ${key}`);
    } else {
      const value = property.value as t.Expression;
      ctx.overwrite(property, `${newKey}: ${thunk(ctx, value)}`);
    }
  });
}

function rewriteResultPattern(path: NodePath<t.CallExpression>): t.ObjectPattern | undefined {
  const parent = path.parentPath;
  if (parent?.isVariableDeclarator() && parent.node.id.type === 'ObjectPattern') return parent.node.id;
  return undefined;
}

export const kitRule: Rule = {
  name: 'kit',
  description:
    'useShowTransition*/useMediaTransition* → createShowTransition/createMediaTransition; useInfiniteScroll accessors',
  run(ctx: Ctx) {
    ctx.program.traverse({
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.get('callee');
        if (!callee.isIdentifier()) return;
        const name = callee.node.name;
        const call = path.node;
        const args = call.arguments as t.Expression[];
        const calleeEnd =
          (call as t.CallExpression & { typeParameters?: t.Node; typeArguments?: t.Node }).typeParameters?.end ??
          (call as t.CallExpression & { typeArguments?: t.Node }).typeArguments?.end ??
          callee.node.end!;

        if ((name === 'useShowTransition' || name === 'useMediaTransition') && isGlobalRef(callee, name)) {
          const target = name === 'useShowTransition' ? 'createShowTransition' : 'createMediaTransition';
          ctx.overwrite([callee.node.start!, calleeEnd], target);
          const options = args[0];
          if (options?.type === 'ObjectExpression') rewriteOptions(ctx, options);
          else ctx.todo(call, 'transition-options', `${name} options are not an object literal`);
          const pattern = rewriteResultPattern(path);
          if (pattern) {
            for (const property of pattern.properties) {
              if (property.type !== 'ObjectProperty' || property.key.type !== 'Identifier') continue;
              const local = property.value.type === 'Identifier' ? property.value.name : property.key.name;
              if (property.key.name === 'ref') {
                // the result `ref` is a callback: `ref.current` reads need an element variable
                const binding = path.scope.getBinding(local);
                for (const ref of binding?.referencePaths ?? []) {
                  const parent = ref.parentPath;
                  if (
                    parent?.isMemberExpression({ object: ref.node }) &&
                    !parent.node.computed &&
                    (parent.node.property as t.Identifier).name === 'current'
                  ) {
                    ctx.todo(
                      parent.node,
                      'transition-ref-current',
                      `${local} is a callback ref now: keep the element in a let assigned from ref={(el) => { ${local}(el); element = el; }}`,
                    );
                  }
                }
                continue;
              }
              const renamed = RESULT_RENAMES[property.key.name];
              if (!renamed) continue;
              ctx.overwrite(property, `${renamed}: ${local}`);
            }
          }
          ctx.hit(name);
          return;
        }

        if (name === 'useShowTransitionDeprecated' && isGlobalRef(callee, name)) {
          const [isOpen, onClose, noFirstOpen, className, noClose, closeDuration, noOpen] = args.map((arg) =>
            arg.type === 'Identifier' && arg.name === 'undefined' ? undefined : arg,
          );
          const fields = [
            `isOpen: ${isOpen ? thunk(ctx, isOpen) : '() => false'}`,
            onClose && `onCloseAnimationEnd: ${ctx.text(onClose)}`,
            noFirstOpen && `noMountTransition: ${ctx.text(noFirstOpen)}`,
            className && `className: ${ctx.text(className)}`,
            noClose && `noCloseTransition: ${thunk(ctx, noClose)}`,
            closeDuration && `closeDuration: ${ctx.text(closeDuration)}`,
            noOpen && `noOpenTransition: ${thunk(ctx, noOpen)}`,
          ].filter(Boolean);
          ctx.overwrite(call, `createShowTransition({ ${fields.join(', ')} })`);
          ctx.todo(
            call,
            'transition-classes',
            'useShowTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element (transitionClassNames/hasOpenClass are gone)',
          );
          ctx.hit(name);
          return;
        }

        if (name === 'useMediaTransitionDeprecated' && isGlobalRef(callee, name)) {
          ctx.overwrite(
            call,
            `createMediaTransition({ hasMediaData: () => Boolean(${args[0] ? ctx.text(args[0]) : 'undefined'}) })`,
          );
          ctx.todo(
            call,
            'transition-classes',
            'useMediaTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element',
          );
          ctx.hit(name);
          return;
        }

        if (name === 'useInfiniteScroll' && isGlobalRef(callee, name)) {
          let thunked = 0;
          for (const index of [1, 2]) {
            const arg = args[index];
            if (!arg || isFunctionNode(arg) || (arg.type === 'Identifier' && arg.name === 'undefined')) continue;
            ctx.overwrite(arg, ctx.thunk(arg));
            thunked++;
          }
          if (thunked) ctx.hit('useInfiniteScroll');
        }
      },
    });
  },
};
