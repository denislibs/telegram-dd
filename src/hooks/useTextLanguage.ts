import { createEffect, createSignal } from 'frameact';
import { depsOf } from '../util/effectDeps';

import type { Signal } from '../util/signals';

import { detectLanguage } from '../util/languageDetection';

// TODO(codemod): useTextLanguage: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useTextLanguage(text?: string, isDisabled?: boolean, getIsReady?: Signal<boolean>) {
  const [language, setLanguage] = createSignal<string | undefined>(undefined);
  let lastTextRef: string | undefined;

  createEffect(depsOf(() => [isDisabled, text, getIsReady]), () => {
    if (isDisabled || (getIsReady && !getIsReady()) || lastTextRef === text) return;

    let isCancelled = false;

    if (!text) {
      setLanguage(undefined);
      lastTextRef = undefined;
      return;
    }

    detectLanguage(text)
      .then((lang) => {
        if (isCancelled) {
          return;
        }

        setLanguage(lang);
      })
      .finally(() => {
        if (isCancelled) {
          return;
        }

        lastTextRef = text;
      });

    return () => {
      isCancelled = true;
    };
  });

  return language;
}
