import { createEffect } from 'frameact';

import { createCallbackManager } from '../util/callbacks';
import { getHotkeyMatcher } from '../util/parseHotkey';

const IGNORE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const handlers = createCallbackManager();
document.documentElement.addEventListener('keydown', handlers.runCallbacks);

// TODO(codemod): useHotkeys: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export function useHotkeys(hotkeys?: Record<string, (e: KeyboardEvent) => void>) {
  createEffect(
    () => hotkeys,
    () => {
      if (!hotkeys) {
        return undefined;
      }

      const entries = Object.entries(hotkeys);

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
