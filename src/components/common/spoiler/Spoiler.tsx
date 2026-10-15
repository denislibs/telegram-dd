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
  let contentRef!: HTMLDivElement;

  const [isRevealed, revealSpoiler] = useFlag();

  const handleClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!props.containerId) return;

    if (!isRevealed()) {
      stopEvent(e);
    }

    revealByContainerId.get(props.containerId)?.forEach((reveal) => reveal());
  };

  createEffect(() => props.containerId, (containerId2) => {
    if (!containerId2) {
      return undefined;
    }

    if (revealByContainerId.has(containerId2)) {
      revealByContainerId.get(containerId2)!.push(revealSpoiler);
    } else {
      revealByContainerId.set(containerId2, [revealSpoiler]);
    }

    return () => {
      revealByContainerId.delete(containerId2);
    };
  });

  return (
    <span
      class={buildClassName('&', !isRevealed() && 'concealed', !isRevealed() && Boolean(props.containerId) && 'animated')}
      onClick={props.containerId && !isRevealed() ? handleClick : undefined}
      data-entity-type={ApiMessageEntityTypes.Spoiler}
    >
      <span class={buildClassName('content')} ref={contentRef}>
        {props.children}
      </span>
    </span>
  );
};

export default Spoiler;
