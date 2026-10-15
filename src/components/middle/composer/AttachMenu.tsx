// FOUNDATION STUB: AttachMenu (telegram-tt src/components/middle/composer/AttachMenu.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders tt's outer element and the (inert) attach button, so that the composer has tt's layout. The
// menu itself, the file pickers and the polls, to-do lists, dates and bots in it are not ported.
import { Show } from 'frameact/dom';

import type { ApiAttachMenuPeerType, ApiFormattedText, ApiMessage } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { MessageListType, ThemeKey, ThreadId } from '../../../types';

import Icon from '../../common/icons/Icon';
import ResponsiveHoverButton from '../../ui/ResponsiveHoverButton';

export type OwnProps = {
  chatId: string;
  threadId?: ThreadId;
  isButtonVisible: boolean;
  canAttachMedia: boolean;
  canAttachFiles: boolean;
  canAttachPolls: boolean;
  canAttachToDoLists: boolean;
  canSendPhotos: boolean;
  canSendVideos: boolean;
  canSendDocuments: boolean;
  canSendAudios: boolean;
  isScheduled?: boolean;
  attachBots?: GlobalState['attachMenu']['bots'];
  canSendMoney?: boolean;
  peerType?: ApiAttachMenuPeerType;
  shouldCollectDebugLogs?: boolean;
  theme: ThemeKey;
  canEditMedia?: boolean;
  isRichInputExpanded?: boolean;
  editingMessage?: ApiMessage;
  messageListType: MessageListType;
  paidMessagesStars?: number;
  canInsertDate?: boolean;
  canExpandRichInput?: boolean;
  menuPositionX: 'left' | 'right';
  onFileSelect: (files: File[], shouldSendAsFile?: boolean) => void;
  onDateInsert: (text: ApiFormattedText) => void;
  onTodoListCreate: NoneToVoidFunction;
  onRichInputExpand: NoneToVoidFunction;
  onMenuOpen: NoneToVoidFunction;
  onMenuClose: NoneToVoidFunction;
};

const AttachMenu = (props: OwnProps) => (
  <Show when={props.isButtonVisible}>
    <div class="AttachMenu">
      <ResponsiveHoverButton
        id="attach-menu-button"
        disabled={Boolean(props.editingMessage && (!props.isRichInputExpanded || props.canEditMedia))}
        className="AttachMenu--button composer-action-button"
        round
        color="translucent"
        // TODO(port): opens the attach menu
        onActivate={() => {}}
        ariaLabel="Add an attachment"
        ariaControls="attach-menu-controls"
        hasPopup
      >
        <Icon name="attach" />
      </ResponsiveHoverButton>
    </div>
  </Show>
);

export default AttachMenu;
