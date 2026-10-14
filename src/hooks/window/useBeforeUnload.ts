import { onMount } from 'frameact';

import { onBeforeUnload } from '../../util/schedulers';

export default function useBeforeUnload(callback: AnyToVoidFunction) {
  onMount(() => onBeforeUnload(callback));
}
