import { type Accessor, createEffect, createSignal, untrack } from 'frameact';
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

// Deviation (security): whether the spoilers of a container (a message) are concealed, for the entities that live inside one: a
// link or a date shows a tooltip (`title`) with what it points at, which is the hidden text itself (S1 of the messages security
// review). The entities are created before the Spoiler around them, so a container that has no Spoiler yet counts as concealed.
type ContainerState = {
  counts: Accessor<{ total: number; concealed: number }>;
  setCounts: (update: (counts: { total: number; concealed: number }) => { total: number; concealed: number }) => void;
  isConcealed: Accessor<boolean>;
};
const containerStates = new Map<string, ContainerState>();

function getContainerState(containerId: string) {
  let state = containerStates.get(containerId);
  if (!state) {
    const [counts, setCounts] = createSignal({ total: 0, concealed: 0 });
    state = {
      counts,
      setCounts: (update) => setCounts(update),
      isConcealed: () => counts().total === 0 || counts().concealed > 0,
    };
    containerStates.set(containerId, state);
  }

  return state;
}

/** Whether a Spoiler of the container is concealed (or none has been made yet). */
export function isSpoilerContainerConcealed(containerId: string): Accessor<boolean> {
  return getContainerState(containerId).isConcealed;
}

const buildClassName = createClassNameBuilder('Spoiler');

const Spoiler = (props: OwnProps) => {
  let contentRef!: HTMLSpanElement;

  const [isRevealed, revealSpoiler] = useFlag();
  // Whether this spoiler is counted as concealed in the state of its container
  let isCountedConcealed = false;

  const revealThis = () => {
    revealSpoiler();
    if (isCountedConcealed && props.containerId) {
      isCountedConcealed = false;
      getContainerState(props.containerId).setCounts((counts) => ({ ...counts, concealed: counts.concealed - 1 }));
    }
  };

  // Deviation (security): the click is intercepted in the capture phase while the spoiler is concealed, so the first click
  // only reveals. tt bound a bubbling `onClick` here: the handler of a link or of a bot command under the spoiler ran first
  // (the innermost handler runs first), so one click on a concealed `https://...` opened it with no confirmation and on a
  // concealed `/command` sent it to the chat. A middle click (`auxclick`, a new tab) is stopped the same way.
  // Deviation: the "no container / already revealed" checks that tt made while building the prop are made in the handler.
  const handleCapturedClick = (e: Event) => {
    if (!props.containerId || isRevealed()) return;

    stopEvent(e);
    // Deviation: the spoiler reveals itself too, even when its registration was dropped (see the cleanup below)
    revealThis();
    revealByContainerId.get(props.containerId)?.forEach((reveal) => reveal());
  };

  const handleCapturedAuxClick = (e: Event) => {
    if (!props.containerId || isRevealed()) return;

    stopEvent(e);
  };

  createEffect(
    () => props.containerId,
    (containerId2) => {
      if (!containerId2) {
        return undefined;
      }

      if (revealByContainerId.has(containerId2)) {
        revealByContainerId.get(containerId2)!.push(revealThis);
      } else {
        revealByContainerId.set(containerId2, [revealThis]);
      }
      const state = getContainerState(containerId2);
      const wasRevealed = untrack(isRevealed);
      isCountedConcealed = !wasRevealed;
      state.setCounts((counts) => ({ total: counts.total + 1, concealed: counts.concealed + (wasRevealed ? 0 : 1) }));

      // Deviation: tt dropped the whole container entry here, so one spoiler of a message that is gone (a text edit
      // re-renders all of them) left its siblings unregistered. Only this spoiler's own registration is removed.
      return () => {
        const reveals = revealByContainerId.get(containerId2);
        if (reveals) {
          const index = reveals.indexOf(revealThis);
          if (index >= 0) reveals.splice(index, 1);
          if (!reveals.length) revealByContainerId.delete(containerId2);
        }

        const wasCounted = isCountedConcealed;
        isCountedConcealed = false;
        state.setCounts((counts) => ({ total: counts.total - 1, concealed: counts.concealed - (wasCounted ? 1 : 0) }));
        if (state.counts().total <= 0 && containerStates.get(containerId2) === state) {
          containerStates.delete(containerId2);
        }
      };
    },
  );

  return (
    <span
      ref={(el: HTMLSpanElement) => {
        el.addEventListener('click', handleCapturedClick, true);
        el.addEventListener('auxclick', handleCapturedAuxClick, true);
      }}
      class={buildClassName(
        '&',
        !isRevealed() && 'concealed',
        !isRevealed() && Boolean(props.containerId) && 'animated',
      )}
      data-entity-type={ApiMessageEntityTypes.Spoiler}
    >
      <span class={buildClassName('content')} ref={contentRef}>
        {props.children}
      </span>
    </span>
  );
};

export default Spoiler;
