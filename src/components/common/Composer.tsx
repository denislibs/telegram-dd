// FOUNDATION STUB: Composer (telegram-tt src/components/common/Composer.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { JSX } from 'frameact/jsx-runtime';
import type { MessageListType, ThreadId } from '../../types';

export type OwnProps = {
  type: ComposerType;
  chatId: string;
  threadId: ThreadId;
  storyId?: number;
  messageListType: MessageListType;
  dropAreaState?: string;
  isReady: boolean;
  isMobile?: boolean;
  inputId: string;
  editableInputCssSelector: string;
  editableInputId: string;
  className?: string;
  inputPlaceholder?: JSX.Element | string;
  onDropHide?: NoneToVoidFunction;
  onForward?: NoneToVoidFunction;
  onFocus?: NoneToVoidFunction;
  onBlur?: NoneToVoidFunction;
};
export type ComposerType = 'messageList' | 'story';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Composer = (_props: OwnProps) => undefined;

export default Composer;
