import { createEffect, createSignal, untrack } from 'frameact';
import { Show } from 'frameact/dom';

import type { ApiMessageOutgoingStatus } from '../../api/types';

import Transition from '../ui/Transition';
import Icon from './icons/Icon';

import './MessageOutgoingStatus.scss';

type OwnProps = {
  status: ApiMessageOutgoingStatus;
};

enum Keys {
  failed,
  pending,
  succeeded,
  read,
}

const renderIcon = (status: ApiMessageOutgoingStatus) =>
  status === 'failed' ? (
    <div class="MessageOutgoingStatus--failed">
      <Icon name="message-failed" />
    </div>
  ) : (
    <Icon name={status === 'succeeded' ? 'check' : `message-${status}`} />
  );

// Perf (not in tt): a `Transition` costs ~0.14 ms per own message at 4x (a dozen computations and effects) and nearly every status
// never changes while the message is on the screen. The status is rendered as a plain icon in the DOM of a `Transition` (the same
// wrapper and slide elements) until it changes; then the real `Transition` is mounted showing the new status (the first change is
// not animated: the later ones are).
const MessageOutgoingStatus = (props: OwnProps) => {
  const initialStatus = untrack(() => props.status);
  const [isDynamic, setIsDynamic] = createSignal(false);

  createEffect(
    () => props.status,
    (status) => {
      if (status !== initialStatus) setIsDynamic(true);
    },
  );

  return (
    <div class="MessageOutgoingStatus">
      <Show
        when={isDynamic()}
        fallback={
          <div class="Transition">
            <div class="Transition_slide Transition_slide-active">{renderIcon(initialStatus)}</div>
          </div>
        }
      >
        <Transition name="reveal" activeKey={Keys[props.status]}>
          {(slide) => {
            // Each slide renders the status of its own key, so the outgoing slide keeps showing the previous one
            return renderIcon(Keys[slide.key] as ApiMessageOutgoingStatus);
          }}
        </Transition>
      </Show>
    </div>
  );
};

export default MessageOutgoingStatus;
