import useForceUpdate from '../useForceUpdate';
import useInterval from './useInterval';

// TODO(codemod): useIntervalForceUpdate: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useIntervalForceUpdate(interval?: number) {
  // TODO(codemod): useForceUpdate: a component runs once; make the changing value a signal and delete the force update
  const forceUpdate = useForceUpdate();

  useInterval(forceUpdate, interval, true);
}
