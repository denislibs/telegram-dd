// FOUNDATION STUB: RecordModeMenu (telegram-tt src/components/middle/composer/RecordModeMenu.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
export type RecordMode = 'voice' | 'video';

type OwnProps = {
  isOpen: boolean;
  onSelectMode: (mode: RecordMode) => void;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd?: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RecordModeMenu = (_props: OwnProps) => undefined;

export default RecordModeMenu;
