import { For } from 'frameact/dom';
import { getActions, withGlobal } from '../../global';

import type { MessageList as GlobalMessageList } from '../../types';

import { selectTabState } from '../../global/selectors';
import { createLocationHash } from '../../util/routing';

import useHistoryBack from '../../hooks/useHistoryBack';

type StateProps = {
  messageLists?: GlobalMessageList[];
};

// Actual `MessageList` components are unmounted when deep in the history,
// so we need a separate component just for handling history
// Deviation: rows are keyed by the message-list entry (a stable store object) instead of tt's `${chatId}_${threadId}_${type}_${i}`.
const MessageListHistoryHandler = (ownProps: AnyLiteral) => {
  const props = withGlobal(ownProps, (global): Complete<StateProps> => {
    return {
      messageLists: selectTabState(global).messageLists,
    };
  });
  const { openChat } = getActions();

  const closeChat = () => {
    openChat({ id: undefined }, { forceSyncOnIOs: true });
  };

  return (
    <div>
      <For each={props.messageLists ?? []}>
        {(messageList) => (
          <MessageHistoryRecord
            chatId={messageList.chatId}
            type={messageList.type}
            threadId={messageList.threadId}
            onBack={closeChat}
          />
        )}
      </For>
    </div>
  );
};

const MessageHistoryRecord = (props: GlobalMessageList & { onBack: NoneToVoidFunction }) => {
  useHistoryBack({
    isActive: true,
    hash: () => createLocationHash(props.chatId, props.type, props.threadId),
    onBack: () => props.onBack(),
  });

  return undefined;
};

export default MessageListHistoryHandler;
