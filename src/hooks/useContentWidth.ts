import { createEffect, requestMeasure, requestMutation, requestNextMutation } from 'frameact';
import { setExtraStyles } from 'frameact/dom';

import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';

const WIDTH_OVERSHOOT = 1;

// Deviation: the refs are accessors of the elements and `deps` is an accessor of the dependency array (tt: ref objects
// and the array itself); the effect runs on mount and whenever a value in the array changes.
export default function useContentWidth(
  targetRef: MaybeAccessor<HTMLElement | undefined>,
  contentRef: MaybeAccessor<HTMLElement | undefined>,
  deps: MaybeAccessor<readonly unknown[]>,
) {
  let isFirstRun = true;

  createEffect(
    depsOf(() => [...read(deps)]),
    () => {
      requestMeasure(() => {
        const target = read(targetRef);
        const content = read(contentRef);
        if (!target || !content) return;

        const { paddingLeft, paddingRight } = getComputedStyle(target);
        const width = content.scrollWidth + parseFloat(paddingLeft) + parseFloat(paddingRight) + WIDTH_OVERSHOOT;

        requestMutation(() => {
          if (!isFirstRun) {
            setExtraStyles(target, { width: `${width}px` });
            return;
          }

          isFirstRun = false;
          setExtraStyles(target, { width: `${width}px`, transition: 'none' });
          requestNextMutation(() => {
            setExtraStyles(target, { width: `${width}px`, transition: '' });
          });
        });
      });
    },
  );
}
