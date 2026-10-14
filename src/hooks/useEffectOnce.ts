import { onMount } from 'frameact';

// TODO(codemod): useEffectOnce: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
function useEffectOnce(effect: React.EffectCallback) {
  // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
  onMount(effect);
}

export default useEffectOnce;
