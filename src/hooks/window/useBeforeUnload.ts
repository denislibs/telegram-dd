import { onMount } from 'frameact';

import { onBeforeUnload } from '../../util/schedulers';
import useLastCallback from '../useLastCallback';

// TODO(codemod): useBeforeUnload: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useBeforeUnload(callback: AnyToVoidFunction) {
  const lastCallback = callback;

  onMount(() => onBeforeUnload(lastCallback));
}
