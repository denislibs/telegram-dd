import { createEffect } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { createCallbackManager } from '../util/callbacks';
import { getHotkeyMatcher } from '../util/parseHotkey';

const IGNORE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const handlers = createCallbackManager();
document.documentElement.addEventListener('keydown', handlers.runCallbacks);

export function useHotkeys(hotkeys?: MaybeAccessor<Record<string, (e: KeyboardEvent) => void> | undefined>) {
  createEffect(
    () => read(hotkeys),
    (hotkeys2) => {
      if (!hotkeys2) {
        return undefined;
      }

      const entries = Object.entries(hotkeys2);

      function handleKeyDown(e: KeyboardEvent) {
        if (!shouldFireEvent(e)) {
          return;
        }

        entries.forEach(([hotkey, handler]) => {
          if (getHotkeyMatcher(hotkey)(e)) {
            handler(e);
          }
        });
      }

      return handlers.addCallback(handleKeyDown);
    },
  );
}

function shouldFireEvent(e: KeyboardEvent) {
  if (e.target instanceof HTMLElement) {
    return !IGNORE_TAGS.has(e.target.tagName);
  }

  return true;
}
