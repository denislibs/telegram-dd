// FOUNDATION STUB: the archived chats list (ArchivedChats) (telegram-tt src/components/left/ArchivedChats.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { GlobalState } from '../../global/types';
import type { FolderEditDispatch } from '../../hooks/reducers/useFoldersReducer';

export type OwnProps = {
  isActive: boolean;
  isForumPanelOpen?: boolean;
  archiveSettings: GlobalState['archiveSettings'];
  isStoryRibbonShown?: boolean;
  onReset: () => void;
  onTopicSearch: NoneToVoidFunction;
  foldersDispatch: FolderEditDispatch;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ArchivedChatsAsync = (_props: OwnProps) => undefined;

export default ArchivedChatsAsync;
