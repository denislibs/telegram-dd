// FOUNDATION STUB (types only): the teactn binding (getGlobal/setGlobal/getActions…) is replaced by the frameact
// store (model B) in the app-layer port. The ported API layer only needs the `GlobalActions` type.
import type { ActionPayloads, RequiredActionPayloads } from './types';

type ProjectActionTypes = ActionPayloads & RequiredActionPayloads;

export type GlobalActions = {
  [ActionName in keyof ProjectActionTypes]: (payload?: ProjectActionTypes[ActionName], options?: AnyLiteral) => void;
};
