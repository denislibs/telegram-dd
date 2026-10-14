// `withGlobal(mapper, activation?)(X)` call sites, per the store contract (docs/store-architecture.md §12.2): the HOC
// becomes a call in the component body, `const props = withGlobal(ownProps, mapStateToProps, ACTIVATION?)` (emitted by
// the props rule), the export becomes the plain component, `withGlobal` keeps its import from `../global`, no type
// argument (both types are inferred). The mapper stays at module level where tt had it, as
// `const mapStateToProps = (global: GlobalState, ownProps: OwnProps) => …` (`MAPPER_PLACEMENT = 'module'`, the
// controller's decision: byte-identical mapper lines); `'inline'` moves its text into the call instead.
import type * as t from '@babel/types';

import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

import { findConnected } from '../analysis.ts';

/** `'inline'`: the mapper text moves into the `withGlobal(ownProps, …)` call (the contract). `'module'`: it stays at module level. */
export const MAPPER_PLACEMENT: 'inline' | 'module' = 'module';
/** The module-level name given to the mapper when `MAPPER_PLACEMENT === 'module'`. */
export const MAP_STATE_NAME = 'mapStateToProps';

/** `mapStateToProps`, suffixed with the component name when a module has several connected components. */
export function mapperName(ctx: Ctx, componentName: string): string {
  return findConnected(ctx).size > 1 ? `${MAP_STATE_NAME}${componentName}` : MAP_STATE_NAME;
}
/** The type of the mapper's `global` parameter (module placement only) and where it comes from (relative to `src/`). */
export const GLOBAL_STATE_TYPE = { name: 'GlobalState', module: 'global/types' };

export const withGlobalRule: Rule = {
  name: 'withGlobal',
  description:
    'withGlobal(map)(X) wrapper → plain export (the body call is emitted by the props rule; store contract §12.2)',
  run(ctx: Ctx) {
    for (const info of findConnected(ctx).values()) {
      const outer = info.memo ?? info.apply;
      const statement = outer.getStatementParent();
      if (!statement) continue;
      if ((MAPPER_PLACEMENT as string) === 'module' && info.mapFn) {
        const mapFn = info.mapFn.node;
        const [globalParam, ownParam] = mapFn.params;
        let text = ctx.text(mapFn);
        const start = mapFn.start!;
        const inserts: { at: number; text: string }[] = [];
        if (globalParam?.type === 'Identifier' && !globalParam.typeAnnotation) {
          inserts.push({ at: globalParam.end!, text: `: ${GLOBAL_STATE_TYPE.name}` });
        }
        if (ownParam && !(ownParam as t.Identifier | t.ObjectPattern).typeAnnotation) {
          inserts.push({ at: ownParam.end!, text: `: ${info.ownPropsType ?? 'OwnProps'}` });
        }
        inserts.sort((a, b) => b.at - a.at);
        for (const insert of inserts) {
          text = text.slice(0, insert.at - start) + insert.text + text.slice(insert.at - start);
        }
        ctx.insertBefore(statement.node.start!, `const ${mapperName(ctx, info.componentName)} = ${text};\n\n`);
      }
      ctx.overwrite(outer.node, info.componentName);
      ctx.hit('withGlobal');
    }
  },
};
