import { createEffect, requestMutation } from 'frameact';
import { depsOf } from '../../../../util/effectDeps';

import { REM } from '../../../common/helpers/mediaDimensions';

const OFFSET_X = REM;

// TODO(codemod): useOverlayPosition: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useOverlayPosition({
  anchorRef,
  overlayRef,
  isMirrored,
  isForMessageEffect,
  isDisabled,
  id,
}: {
  anchorRef: (el: HTMLDivElement) => void;
  overlayRef: (el: HTMLDivElement) => void;
  isMirrored?: boolean;
  isForMessageEffect?: boolean;
  isDisabled?: boolean;
  id?: string;
}) {
  const updatePosition = () => {
    const element = overlayRef.current;
    const anchor = anchorRef.current;
    if (!element || !anchor) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const windowWidth = window.innerWidth;

    requestMutation(() => {
      const anchorCenterY = anchorRect.top + anchorRect.height / 2;
      const anchorBottomY = anchorRect.bottom;
      const y = isForMessageEffect ? anchorBottomY : anchorCenterY;
      element.style.top = `${y - elementRect.height / 2}px`;

      if (isMirrored) {
        element.style.left = `${anchorRect.left - OFFSET_X}px`;
      } else {
        element.style.right = `${windowWidth - anchorRect.right - OFFSET_X}px`;
      }
    });
  };

  createEffect(depsOf(() => [isDisabled, id]), () => {
    if (isDisabled) return;
    updatePosition();
  });

  createEffect(depsOf(() => [isDisabled, anchorRef]), () => {
    if (isDisabled) return undefined;

    const messagesContainer = anchorRef.current!.closest<HTMLDivElement>('.MessageList')!;
    if (!messagesContainer) return undefined;

    messagesContainer.addEventListener('scroll', updatePosition, { passive: true });

    return () => {
      messagesContainer.removeEventListener('scroll', updatePosition);
    };
  });

  return updatePosition;
}
