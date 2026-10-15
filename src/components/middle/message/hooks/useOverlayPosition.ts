import { type Accessor, createEffect, requestMeasure, requestMutation } from 'frameact';

import { type MaybeAccessor, read } from '../../../../util/accessors';
import { depsOf } from '../../../../util/effectDeps';
import { REM } from '../../../common/helpers/mediaDimensions';

const OFFSET_X = REM;

// Deviation: a hook runs once. The refs are accessors of the element (read when an effect applies, after the element
// is attached) and the flags are `MaybeAccessor`s.
export default function useOverlayPosition({
  anchorRef,
  overlayRef,
  isMirrored,
  isForMessageEffect,
  isDisabled,
  id,
}: {
  anchorRef: Accessor<HTMLElement | undefined>;
  overlayRef: Accessor<HTMLElement | undefined>;
  isMirrored?: MaybeAccessor<boolean | undefined>;
  isForMessageEffect?: MaybeAccessor<boolean | undefined>;
  isDisabled?: MaybeAccessor<boolean | undefined>;
  id?: MaybeAccessor<string | undefined>;
}) {
  const updatePosition = () => {
    const element = overlayRef();
    const anchor = anchorRef();
    if (!element || !anchor) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const isForMessageEffect2 = read(isForMessageEffect);
    const isMirrored2 = read(isMirrored);

    requestMutation(() => {
      const anchorCenterY = anchorRect.top + anchorRect.height / 2;
      const anchorBottomY = anchorRect.bottom;
      const y = isForMessageEffect2 ? anchorBottomY : anchorCenterY;
      element.style.top = `${y - elementRect.height / 2}px`;

      if (isMirrored2) {
        element.style.left = `${anchorRect.left - OFFSET_X}px`;
      } else {
        element.style.right = `${windowWidth - anchorRect.right - OFFSET_X}px`;
      }
    });
  };

  // Deviation: tt's measure of `updatePosition` ran in the effect (a measure phase); the layout reads need one too.
  createEffect(
    depsOf(() => [read(isDisabled), read(id)] as const),
    ([isDisabled2]) => {
      if (isDisabled2) return;
      requestMeasure(updatePosition);
    },
  );

  createEffect(
    () => read(isDisabled),
    (isDisabled2) => {
      if (isDisabled2) return undefined;

      const messagesContainer = anchorRef()?.closest<HTMLDivElement>('.MessageList');
      if (!messagesContainer) return undefined;

      messagesContainer.addEventListener('scroll', updatePosition, { passive: true });

      return () => {
        messagesContainer.removeEventListener('scroll', updatePosition);
      };
    },
  );

  return updatePosition;
}
