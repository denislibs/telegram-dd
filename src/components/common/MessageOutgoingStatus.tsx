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
      {/* TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6) */}
      <Transition name="reveal" activeKey={Keys[props.status]}>
        {props.status === 'failed' ? (
          <div class="MessageOutgoingStatus--failed">
            <Icon name="message-failed" />
          </div>
        ) : (
          <Icon name={props.status === 'succeeded' ? 'check' : `message-${props.status}`} />
        )}
      </Transition>
    </div>
  );
};

export default MessageOutgoingStatus;
