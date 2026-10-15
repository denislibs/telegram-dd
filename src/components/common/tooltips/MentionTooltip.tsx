import { createEffect, frameForcedReflow, frozenWhile } from 'frameact';
import { For, Show } from 'frameact/dom';
import { getGlobal } from '../../../global';

import type { ApiUser } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';

import ListItem from '../../ui/ListItem';
import PrivateChatInfo from '../PrivateChatInfo';
import RichEditorTooltipPanel from './RichEditorTooltipPanel';

import styles from './MentionTooltip.module.scss';
import sharedStyles from './RichEditorTooltip.module.scss';

export type OwnProps = {
  isOpen: boolean;
  selectedIndex: number;
  onInsertUserName: (user: ApiUser, forceFocus?: boolean) => void;
  filteredUsers?: ApiUser[];
};

const MentionTooltip = (props: OwnProps) => {
  const isClosing = () => !props.isOpen;
  const selectedIndex = frozenWhile(() => props.selectedIndex, isClosing);
  const onInsertUserName = frozenWhile(() => props.onInsertUserName, isClosing);
  const filteredUsers = frozenWhile(() => props.filteredUsers, isClosing);

  let containerRef!: HTMLDivElement;

  const handleUserSelect = (userId: string, forceFocus = false) => {
    // No need for expensive global updates on users, so we avoid them
    const usersById = getGlobal().users.byId;
    const user = usersById[userId];
    if (!user) {
      return;
    }

    onInsertUserName()(user, forceFocus);
  };

  const handleClick = (e: MouseEvent, id: string) => {
    e.preventDefault();

    handleUserSelect(id);
  };

  // Deviation: a forced-reflow effect (tt: useEffect). The `focus` class of the items is written in the mutate phase of
  // the same frame, and `scrollIntoView` is a layout read: it has to run after that write.
  createEffect(
    () => selectedIndex(),
    () => {
      containerRef?.querySelector<HTMLElement>('.focus')?.scrollIntoView({ block: 'nearest' });
    },
    frameForcedReflow,
  );

  return (
    <Show when={filteredUsers()?.length}>
      <RichEditorTooltipPanel isOpen={props.isOpen}>
        <div
          ref={containerRef}
          class={buildClassName(sharedStyles.root, styles.root, 'composer-tooltip custom-scroll')}
        >
          <For each={filteredUsers()} keyed={(user) => user.id}>
            {(user, index) => (
              <ListItem
                className="chat-item-clickable scroll-item smaller-icon"
                onClick={handleClick}
                clickArg={user().id}
                focus={selectedIndex() === index()}
              >
                <PrivateChatInfo userId={user().id} avatarSize="small" withUsername noUserStatus />
              </ListItem>
            )}
          </For>
        </div>
      </RichEditorTooltipPanel>
    </Show>
  );
};

export default MentionTooltip;
