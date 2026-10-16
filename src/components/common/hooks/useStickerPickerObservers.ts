import { createEffect, createSignal } from 'frameact';

import { type MaybeAccessor, read } from '../../../util/accessors';
import animateScroll, { isAnimatingScroll } from '../../../util/animateScroll';
import { REM } from '../helpers/mediaDimensions';

import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';

const STICKER_INTERSECTION_THROTTLE = 200;
const STICKER_INTERSECTION_MARGIN = 100;
const STICKER_SHOWING_MARGIN = 100;
const COVERS_INTERSECTION_MARGIN = 200;
const UNFREEZE_DELAY = 200;
const SCROLL_MAX_DISTANCE_WHEN_CLOSE = 200;
const SCROLL_MAX_DISTANCE_WHEN_FAR = 80;
const FOCUS_MARGIN = 0.5 * REM;

// Deviation: the refs are accessors of the elements, `idPrefix` and `isHidden` are `MaybeAccessor`s, `activeSetIndex` is an
// accessor (the observe functions and `selectStickerSet` are plain functions, as in tt).
export function useStickerPickerObservers(
  containerRef: MaybeAccessor<HTMLDivElement | undefined>,
  headerRef: MaybeAccessor<HTMLDivElement | undefined>,
  idPrefix: MaybeAccessor<string>,
  isHidden?: MaybeAccessor<boolean | undefined>,
) {
  const stickerSetIntersectionsRef: boolean[] = [];

  const [activeSetIndex, setActiveSetIndex] = createSignal<number>(0);

  const {
    observe: observeIntersectionForSet,
    freeze: freezeForSet,
    unfreeze: unfreezeForSet,
  } = useIntersectionObserver(
    {
      rootRef: containerRef,
      throttleMs: STICKER_INTERSECTION_THROTTLE,
    },
    (entries) => {
      const stickerSetIntersections = stickerSetIntersectionsRef;

      entries.forEach((entry) => {
        const index = Number(entry.target.id.replace(`${read(idPrefix)}-`, ''));
        stickerSetIntersections[index] = entry.isIntersecting;
      });

      if (isAnimatingScroll(read(containerRef))) {
        return;
      }

      const minIntersectingIndex = stickerSetIntersections.reduce((lowestIndex, isIntersecting, index) => {
        return isIntersecting && index < lowestIndex ? index : lowestIndex;
      }, Infinity);

      if (minIntersectingIndex === Infinity) {
        return;
      }

      setActiveSetIndex(minIntersectingIndex);
    },
  );

  const {
    observe: observeIntersectionForShowingItems,
    freeze: freezeForShowingItems,
    unfreeze: unfreezeForShowingItems,
  } = useIntersectionObserver({
    rootRef: containerRef,
    throttleMs: STICKER_INTERSECTION_THROTTLE,
    margin: STICKER_SHOWING_MARGIN,
  });

  const { observe: observeIntersectionForPlayingItems } = useIntersectionObserver({
    rootRef: containerRef,
    throttleMs: STICKER_INTERSECTION_THROTTLE,
    margin: STICKER_INTERSECTION_MARGIN,
  });

  const { observe: observeIntersectionForCovers } = useIntersectionObserver({
    rootRef: headerRef,
    throttleMs: STICKER_INTERSECTION_THROTTLE,
    margin: COVERS_INTERSECTION_MARGIN,
  });

  // Deviation: tt's `useSyncEffect` froze the observers during the render; this is a tickEnd effect, which still runs
  // before the first observe (the observing effects of the children are created after it).
  createEffect(
    () => read(isHidden),
    (isHidden2) => {
      if (isHidden2) {
        freezeForSet();
        freezeForShowingItems();
      } else {
        const timeout = window.setTimeout(() => {
          unfreezeForShowingItems();
          unfreezeForSet();
        }, UNFREEZE_DELAY);

        return () => {
          clearTimeout(timeout);
        };
      }
      return undefined;
    },
  );

  const selectStickerSet = (index: number) => {
    // Deviation: tt ran the scroll inside the state updater; a setter with side effects is not a good fit for a signal.
    const currentIndex = activeSetIndex();
    const stickerSetEl = document.getElementById(`${read(idPrefix)}-${index}`)!;
    const isClose = Math.abs(currentIndex - index) === 1;

    animateScroll({
      container: read(containerRef)!,
      element: stickerSetEl,
      position: 'start',
      margin: FOCUS_MARGIN,
      maxDistance: isClose ? SCROLL_MAX_DISTANCE_WHEN_CLOSE : SCROLL_MAX_DISTANCE_WHEN_FAR,
      noHeavyAnimation: true,
    });

    setActiveSetIndex(index);
  };

  return {
    activeSetIndex,
    observeIntersectionForSet,
    observeIntersectionForShowingItems,
    observeIntersectionForPlayingItems,
    observeIntersectionForCovers,
    selectStickerSet,
  };
}
