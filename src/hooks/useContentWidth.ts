import { createEffect, requestMeasure, requestMutation, requestNextMutation } from 'frameact';
import { setExtraStyles } from 'frameact/dom';

const WIDTH_OVERSHOOT = 1;

// TODO(codemod): useContentWidth: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useContentWidth(
  targetRef: (el: HTMLElement) => void,
  contentRef: (el: HTMLElement) => void,
  deps: readonly unknown[],
) {
  let isFirstRunRef = true;

  // TODO(codemod): useEffect without a dependency array ran after every render: name the tracked reads in the compute half
  createEffect(
    () => undefined,
    () => {
      requestMeasure(() => {
        const target = targetRef.current;
        const content = contentRef.current;
        if (!target || !content) return;

        const { paddingLeft, paddingRight } = getComputedStyle(target);
        const width = content.scrollWidth + parseFloat(paddingLeft) + parseFloat(paddingRight) + WIDTH_OVERSHOOT;

        requestMutation(() => {
          if (!isFirstRunRef) {
            setExtraStyles(target, { width: `${width}px` });
            return;
          }

          isFirstRunRef = false;
          setExtraStyles(target, { width: `${width}px`, transition: 'none' });
          requestNextMutation(() => {
            setExtraStyles(target, { width: `${width}px`, transition: '' });
          });
        });
      });
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
    },
    deps,
  );
}
