// The ordered rule list. Each rule runs on a fresh parse of the previous rule's output (see transform.ts), so the
// order below is the only coupling between them: types before props (FC<P> moves the type onto the parameter), props
// before the hook rules (they see `props.x`), the hook rules before accessorReads/derived (they see createSignal /
// createMemo bindings), earlyReturn and jsx after derived (reactive reads are calls by then), imports last.
import type { Ctx } from '../context.ts';

import { accessorReadsRule } from './accessorReads.ts';
import { derivedRule } from './derived.ts';
import { derivedHooksRule } from './derivedHooks.ts';
import { earlyReturnRule } from './earlyReturn.ts';
import { effectsRule } from './effects.ts';
import { hooksRule } from './hooks.ts';
import { importsRule } from './imports.ts';
import { jsxRule } from './jsx.ts';
import { kitRule } from './kit.ts';
import { moduleLoaderRule } from './moduleLoader.ts';
import { propsRule } from './props.ts';
import { refsRule } from './refs.ts';
import { stateRule } from './state.ts';
import { typesRule } from './types.ts';
import { withGlobalRule } from './withGlobal.ts';

export interface Rule {
  name: string;
  description: string;
  run(ctx: Ctx): void;
}

export const RULES: Rule[] = [
  typesRule,
  moduleLoaderRule,
  propsRule,
  withGlobalRule,
  stateRule,
  refsRule,
  derivedHooksRule,
  kitRule,
  effectsRule,
  hooksRule,
  accessorReadsRule,
  derivedRule,
  earlyReturnRule,
  jsxRule,
  importsRule,
];
