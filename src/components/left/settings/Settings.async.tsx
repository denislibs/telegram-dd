// FOUNDATION STUB: the settings screens (telegram-tt src/components/left/settings/Settings.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { FolderEditDispatch, FoldersState } from '../../../hooks/reducers/useFoldersReducer';
import type { AnimationLevel, SettingsScreens } from '../../../types';

export type OwnProps = {
  isActive: boolean;
  currentScreen: SettingsScreens;
  foldersState: FoldersState;
  foldersDispatch: FolderEditDispatch;
  animationLevel: AnimationLevel;
  shouldSkipTransition?: boolean;
  hasProfileBackground?: boolean;
  onReset: (forceReturnToChatList?: true | Event) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SettingsAsync = (_props: OwnProps) => undefined;

export default SettingsAsync;
