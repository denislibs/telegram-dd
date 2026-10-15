import { type Accessor, createEffect, createSignal } from 'frameact';

import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';
import { detectLanguage } from '../util/languageDetection';

// Deviation: a hook runs once. The parameters are `MaybeAccessor`s and the result is an accessor. `getIsReady` is read in
// the compute half (it is a signal here, not a render prop), so the detection starts when the list becomes ready.
export default function useTextLanguage(
  text?: MaybeAccessor<string | undefined>,
  isDisabled?: MaybeAccessor<boolean | undefined>,
  getIsReady?: Accessor<boolean>,
): Accessor<string | undefined> {
  const [language, setLanguage] = createSignal<string | undefined>(undefined);
  let lastTextRef: string | undefined;

  createEffect(
    depsOf(() => [read(isDisabled), read(text), getIsReady ? getIsReady() : true] as const),
    ([isDisabled2, text2, isReady]) => {
      if (isDisabled2 || !isReady || lastTextRef === text2) return undefined;

      let isCancelled = false;

      if (!text2) {
        setLanguage(undefined);
        lastTextRef = undefined;
        return undefined;
      }

      detectLanguage(text2)
        .then((lang) => {
          if (isCancelled) {
            return;
          }

          setLanguage(lang);
        })
        // Deviation: the detector is optional (the worker or its wasm may fail to load): no language, no error.
        .catch(() => undefined)
        .finally(() => {
          if (isCancelled) {
            return;
          }

          lastTextRef = text2;
        });

      return () => {
        isCancelled = true;
      };
    },
  );

  return language;
}
