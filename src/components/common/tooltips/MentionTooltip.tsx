import { createMeasureEffect, frozenWhile } from 'frameact';
import { For, Show, splitProps } from 'frameact/dom';
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

const MentionTooltip = (p: OwnProps) => {
  const [, props] = splitProps(p, ['isOpen']);
  const frozen = frozenWhile(
    () => props,
    () => !p.isOpen,
  );
  const selectedIndex = () => frozen().selectedIndex;
  const onInsertUserName = () => frozen().onInsertUserName;
  const filteredUsers = () => frozen().filteredUsers;

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

  const handleClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();

    handleUserSelect(id);
  };

  createMeasureEffect(
    () => selectedIndex(),
    (selectedIndex2) => {
      containerRef?.querySelector<HTMLElement>('.focus')?.scrollIntoView({ block: 'nearest' });
    },
  );

  return (
    <Show when={filteredUsers()?.length}>
      <RichEditorTooltipPanel isOpen={p.isOpen}>
        <div
          ref={containerRef}
          class={buildClassName(sharedStyles.root, styles.root, 'composer-tooltip custom-scroll')}
        >
          <For each={filteredUsers()}>
            {({ id }, index) => (
              <ListItem
                className="chat-item-clickable scroll-item smaller-icon"
                onClick={handleClick}
                clickArg={id}
                focus={selectedIndex() === index()}
              >
                <PrivateChatInfo userId={id} avatarSize="small" withUsername noUserStatus />
              </ListItem>
            )}
          </For>
        </div>
      </RichEditorTooltipPanel>
    </Show>
  );
};

export default MentionTooltip;
