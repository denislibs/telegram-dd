import { getActions, withGlobal } from '../../../global';

import type { ApiChatFolder, ApiSticker } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { FolderEditDispatch } from '../../../hooks/reducers/useFoldersReducer';
import { SettingsScreens } from '../../../types';

import { selectAnimatedEmoji, selectChatFolder } from '../../../global/selectors';

import useAppLayout from '../../../hooks/useAppLayout';
import useOldLang from '../../../hooks/useOldLang';

import AnimatedIconFromSticker from '../../common/AnimatedIconFromSticker';
import Button from '../../ui/Button';

import styles from './EmptyFolder.module.scss';

type OwnProps = {
  folderId?: number;
  folderType: 'all' | 'archived' | 'saved' | 'folder';
  foldersDispatch: FolderEditDispatch;
};

type StateProps = {
  chatFolder?: ApiChatFolder;
  animatedEmoji?: ApiSticker;
};

const ICON_SIZE = 96;

const EmptyFolder = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { openSettingsScreen } = getActions();
  const lang = useOldLang();
  const { isMobile } = useAppLayout();

  const handleEditFolder = () => {
    props.foldersDispatch({ type: 'editFolder', payload: props.chatFolder });
    openSettingsScreen({ screen: SettingsScreens.FoldersEditFolderFromChatList });
  };

  return (
    <div class={styles.root}>
      <div class={styles.sticker}>
        {props.animatedEmoji && <AnimatedIconFromSticker sticker={props.animatedEmoji} size={ICON_SIZE} />}
      </div>
      <h3 class={styles.title} dir="auto">
        {lang('FilterNoChatsToDisplay')}
      </h3>
      <p class={styles.description} dir="auto">
        {lang(props.chatFolder ? 'ChatList.EmptyChatListFilterText' : 'Chat.EmptyChat')}
      </p>
      {props.chatFolder && (
        <Button ripple={!isMobile()} fluid pill iconName="settings" onClick={handleEditFolder} isRtl={lang.isRtl}>
          <div class={styles.buttonText}>{lang('ChatList.EmptyChatListEditFilter')}</div>
        </Button>
      )}
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { folderId, folderType }: OwnProps): Complete<StateProps> => {
  const chatFolder = folderId && folderType === 'folder' ? selectChatFolder(global, folderId) : undefined;

  return {
    chatFolder,
    animatedEmoji: selectAnimatedEmoji(global, '📂'),
  };
};

export default EmptyFolder;
