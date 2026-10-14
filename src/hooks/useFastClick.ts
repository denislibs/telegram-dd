import { IS_TOUCH_ENV, MouseButton } from '../util/browser/windowEnvironment';
import useLastCallback from './useLastCallback';

type EventArg<E> = React.MouseEvent<E>;
type EventHandler<E> = (e: EventArg<E>) => void;

// TODO(codemod): useFastClick: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useFastClick<T extends HTMLDivElement | HTMLButtonElement>(callback?: EventHandler<T>) {
  const handler = (e: EventArg<T>) => {
    if (e.type === 'mousedown' && e.button !== MouseButton.Main) {
      return;
    }

    callback!(e);
  };

  return IS_TOUCH_ENV
    ? { handleClick: callback ? handler : undefined }
    : { handleMouseDown: callback ? handler : undefined };
}
