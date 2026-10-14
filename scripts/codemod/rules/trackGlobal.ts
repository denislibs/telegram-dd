// Store contract §12.8: the helpers that read `getGlobal()` themselves are tracked when called from a `withGlobal` /
// `useSelector` mapper; a call from a ported hook, a `createMemo`, an effect or a JSX binding must be wrapped in
// `trackGlobal(() => …)` so that its reads subscribe too. Event handlers read untracked and are left alone.
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

import { findBodies } from '../analysis.ts';

/** The exact list of §12.8 (`getMessageTranscription` / `renderMessageSummary` are one entry there). */
export const GLOBAL_READING_HELPERS = new Set([
  'getCanPostInChat',
  'getPeerColorCount',
  'getGroupStatus',
  'getMessageTranscription',
  'renderMessageSummary',
  'renderMessageSummaryHtml',
  'sortChatIds',
  'filterPeersByQuery',
  'getCurrentMaxAccountCount',
]);

const TRACKED_CALLEES = new Set([
  'createMemo',
  'createEffect',
  'createMeasureEffect',
  'createMutationEffect',
  'createIdleEffect',
  'createRenderEffect',
  'previous',
  'currentOrPrev',
  'frozenWhile',
]);
const MAPPER_CALLEES = new Set(['withGlobal', 'useSelector', 'useShallowSelector', 'useSelectorSignal', 'trackGlobal']);

/** `onClick={…}`: an event handler reads untracked. */
function isHandlerAttribute(path: NodePath): boolean {
  const node: t.Node = path.node;
  return node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && /^on[A-Z]/.test(node.name.name);
}

function calleeId(path: NodePath): string | undefined {
  if (!path.isCallExpression()) return undefined;
  const callee = path.node.callee;
  return callee.type === 'Identifier' ? callee.name : undefined;
}

export const trackGlobalRule: Rule = {
  name: 'trackGlobal',
  description:
    'getGlobal()-reading helpers called from hooks / memos / effects / JSX → trackGlobal(() => …) (store contract §12.8)',
  run(ctx: Ctx) {
    const hookBodies = new Set<t.Node>(
      findBodies(ctx)
        .filter((b) => b.kind === 'hook')
        .map((b) => b.fn.node),
    );
    ctx.program.traverse({
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;
        if (callee.type !== 'Identifier' || !GLOBAL_READING_HELPERS.has(callee.name)) return;
        if (path.scope.getBinding(callee.name)?.path.isVariableDeclarator()) return; // a local, not the helper
        let tracked = false;
        let insideHandler = false;
        for (let p: NodePath | null = path.parentPath; p; p = p.parentPath) {
          const name = calleeId(p);
          if (name && MAPPER_CALLEES.has(name)) return; // the mapper context tracks; already wrapped
          if (name && TRACKED_CALLEES.has(name)) {
            tracked = true;
            break;
          }
          if (isHandlerAttribute(p)) {
            insideHandler = true;
            break;
          }
          if (p.isJSXExpressionContainer()) {
            tracked = true;
            break;
          }
          if (hookBodies.has(p.node)) {
            tracked = true;
            break;
          }
        }
        if (!tracked || insideHandler) return;
        ctx.insertBefore(path.node.start!, 'trackGlobal(() => ');
        ctx.insertAfter(path.node.end!, ')');
        ctx.hit('trackGlobal');
      },
    });
  },
};
