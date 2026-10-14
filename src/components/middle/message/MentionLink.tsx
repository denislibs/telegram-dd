import type { JSX } from 'frameact/jsx-runtime';
import { getActions, withGlobal } from '../../../global';
import type { GlobalState } from '../../../global/types';

import type { ApiPeer } from '../../../api/types';
import { ApiMessageEntityTypes } from '../../../api/types';

import { selectUser } from '../../../global/selectors';

import useAppLayout from '../../../hooks/useAppLayout';

type OwnProps = {
  userId?: string;
  username?: string;
  children: JSX.Element;
};

type StateProps = {
  userOrChat?: ApiPeer;
};

const MentionLink = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { openChat, openChatByUsername, closeStoryViewer, setShouldCloseRightColumn } = getActions();

  const { isMobile } = useAppLayout();

  const handleClick = () => {
    if (isMobile()) {
      setShouldCloseRightColumn({
        value: true,
      });
    }

    if (props.userOrChat) {
      openChat({ id: props.userOrChat.id });
    } else if (props.username) {
      closeStoryViewer();
      openChatByUsername({ username: props.username.substring(1) });
    }
  };

  return (
    <a
      onClick={handleClick}
      class="text-entity-link"
      dir="auto"
      data-entity-type={props.userId ? ApiMessageEntityTypes.MentionName : ApiMessageEntityTypes.Mention}
    >
      {props.children}
    </a>
  );
};

const mapStateToProps = (global: GlobalState, { userId }: OwnProps): Complete<StateProps> => {
  return {
    userOrChat: userId ? selectUser(global, userId) : undefined,
  };
};

export default MentionLink;
