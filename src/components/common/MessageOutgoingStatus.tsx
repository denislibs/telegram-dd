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
        {(slide) =>
          slide.key === Keys.failed ? (
            <div class="MessageOutgoingStatus--failed">
              <Icon name="message-failed" />
            </div>
          ) : (
            <Icon name={slide.key === Keys.succeeded ? 'check' : `message-${Keys[slide.key] as 'pending' | 'read'}`} />
          )
        }
      </Transition>
    </div>
  );
};

export default MessageOutgoingStatus;
