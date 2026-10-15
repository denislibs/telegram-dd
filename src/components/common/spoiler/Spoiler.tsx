import { createEffect } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';

import { ApiMessageEntityTypes } from '../../../api/types';

import { createClassNameBuilder } from '../../../util/buildClassName';
import stopEvent from '../../../util/stopEvent';

import useFlag from '../../../hooks/useFlag';

import './Spoiler.scss';

type OwnProps = {
  children?: JSX.Element;
  containerId?: string;
};

const revealByContainerId = new Map<string, VoidFunction[]>();

const buildClassName = createClassNameBuilder('Spoiler');

const Spoiler = (props: OwnProps) => {
  let contentRef!: HTMLSpanElement;

  const [isRevealed, revealSpoiler] = useFlag();

  // Deviation: a handler prop of an element is bound once, so the "no container / already revealed" checks that
  // tt made while building the prop (`containerId && !isRevealed ? handleClick : undefined`) are made in the handler.
  const handleClick = (e: MouseEvent) => {
    if (!props.containerId || isRevealed()) return;

    stopEvent(e);

    // Deviation: the spoiler reveals itself too, even when its registration was dropped (see the cleanup below)
    revealSpoiler();
    revealByContainerId.get(props.containerId)?.forEach((reveal) => reveal());
  };

  createEffect(
    () => props.containerId,
    (containerId2) => {
      if (!containerId2) {
        return undefined;
      }

      if (revealByContainerId.has(containerId2)) {
        revealByContainerId.get(containerId2)!.push(revealSpoiler);
      } else {
        revealByContainerId.set(containerId2, [revealSpoiler]);
      }

      // Deviation: tt dropped the whole container entry here, so one spoiler of a message that is gone (a text edit
      // re-renders all of them) left its siblings unregistered. Only this spoiler's own registration is removed.
      return () => {
        const reveals = revealByContainerId.get(containerId2);
        if (!reveals) return;

        const index = reveals.indexOf(revealSpoiler);
        if (index >= 0) reveals.splice(index, 1);
        if (!reveals.length) revealByContainerId.delete(containerId2);
      };
    },
  );

  return (
    <span
      class={buildClassName(
        '&',
        !isRevealed() && 'concealed',
        !isRevealed() && Boolean(props.containerId) && 'animated',
      )}
      onClick={handleClick}
      data-entity-type={ApiMessageEntityTypes.Spoiler}
    >
      <span class={buildClassName('content')} ref={contentRef}>
        {props.children}
      </span>
    </span>
  );
};

export default Spoiler;
