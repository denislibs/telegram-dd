// FOUNDATION STUB: MiddleHeaderPanesIsland (telegram-tt src/components/middle/MiddleHeaderPanesIsland.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { MessageListType, ThreadId } from '../../types';
import type { Signal } from '../../util/signals';

export type OwnProps = {
  className?: string;
  chatId: string;
  threadId: ThreadId;
  messageListType: MessageListType;
  getCurrentPinnedIndex: Signal<number>;
  getLoadingPinnedId: Signal<number | undefined>;
  isChatClosing?: boolean;
  onFocusPinnedMessage: (messageId: number) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MiddleHeaderPanesIsland = (_props: OwnProps) => undefined;

export default MiddleHeaderPanesIsland;
