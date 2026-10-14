import { onMount } from 'frameact';

// Deviation: `onMount` (after attach, measure phase) instead of `useEffect(…, [])`.
function useEffectOnce(effect: React.EffectCallback) {
  onMount(effect);
}

export default useEffectOnce;
