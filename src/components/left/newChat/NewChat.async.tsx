// FOUNDATION STUB: the new chat / new channel screens (telegram-tt src/components/left/newChat/NewChat.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { AnimationLevel, LeftColumnContent } from '../../../types';

export type OwnProps = {
  isActive: boolean;
  isChannel?: boolean;
  content: LeftColumnContent;
  animationLevel: AnimationLevel;
  onReset: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NewChatAsync = (_props: OwnProps) => undefined;

export default NewChatAsync;
