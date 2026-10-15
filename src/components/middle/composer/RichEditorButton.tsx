// FOUNDATION STUB: RichEditorButton (telegram-tt src/components/middle/composer/RichEditorButton.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { TeactNodeViewComponentProps } from '../../../util/tiptap/TeactNodeViewRenderer';

type OwnProps = Pick<TeactNodeViewComponentProps, 'editor' | 'node' | 'getPos'> & {
  selected?: boolean;
  isInRow?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RichEditorButton = (_props: OwnProps) => undefined;

export default RichEditorButton;
