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

const MessageOutgoingStatus = (props: OwnProps) => {
  return (
    <div class="MessageOutgoingStatus">
      <Transition name="reveal" activeKey={Keys[props.status]}>
        {(slide) => {
          // Each slide renders the status of its own key, so the outgoing slide keeps showing the previous one
          const status = Keys[slide.key] as ApiMessageOutgoingStatus;

          return status === 'failed' ? (
            <div class="MessageOutgoingStatus--failed">
              <Icon name="message-failed" />
            </div>
          ) : (
            <Icon name={status === 'succeeded' ? 'check' : `message-${status}`} />
          );
        }}
      </Transition>
    </div>
  );
};

export default MessageOutgoingStatus;
