import { createMemo } from 'frameact';
// TODO(codemod): still imported from teact: useContextSignal
import { useContextSignal } from '../../lib/teact/teact';

import useDerivedState from '../useDerivedState';

// TODO(codemod): useContext: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useContext<T>(context: Context<T>) {
  const signal = useContextSignal(context);
  return createMemo(signal);
}
