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

// The stub keeps the outer size of tt's composer (a 3rem high row and 1rem below it: the message list reserves
// the space under its messages from the height of the footer), so that the layout of the list is tt's until the composer is
// ported. It is blank and inert (no input, no buttons).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Composer = (_props: OwnProps) => <div class="Composer" style="height: 3rem; margin-bottom: 1rem" aria-hidden="true" />;

export default Composer;
