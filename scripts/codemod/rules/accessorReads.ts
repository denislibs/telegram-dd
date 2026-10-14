// Signals, memos and the accessors returned by ported hooks are functions: every read `x` becomes `x()`.
import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

import { classifyBindings, collectPropKinds, findBodies, referencesOf, rewriteReads } from '../analysis.ts';

export const accessorReadsRule: Rule = {
  name: 'accessorReads',
  description: 'reads of signal/memo/flag accessors → x()',
  run(ctx: Ctx) {
    const propKinds = collectPropKinds(ctx);
    for (const body of findBodies(ctx)) {
      const kinds = classifyBindings(ctx, body, propKinds);
      for (const [name, kind] of kinds.byName) {
        if (kind !== 'accessor') continue;
        const binding = kinds.bindings.get(name);
        if (!binding) continue;
        // A hook returns its accessors as they are: `return [value, setTrue]`, `return { isOpen }`.
        const returned = new Set<string>();
        if (body.kind === 'hook') {
          for (const ref of referencesOf(binding)) {
            const parent = ref.parentPath;
            const container = parent.isObjectProperty({ value: ref.node }) ? parent.parentPath : parent;
            if (container.isReturnStatement() || container.parentPath?.isReturnStatement()) {
              returned.add(String(ref.node.start));
            }
          }
        }
        const count = rewriteReads(ctx, binding, `${name}()`, {
          filter: (ref) => !returned.has(String(ref.node.start)),
        });
        if (count) ctx.hit('accessorRead', count);
      }
    }
  },
};
