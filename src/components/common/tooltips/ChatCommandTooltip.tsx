import { createEffect, createMemo, frameForcedReflow, frozenWhile } from 'frameact';
import { For, Show } from 'frameact/dom';
import { useGlobal } from '../../../global';

import type { ApiBotCommand, ApiMessage, ApiQuickReply, ApiUser } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';

import ChatCommand from '../../middle/composer/ChatCommand';
import RichEditorTooltipPanel from './RichEditorTooltipPanel';

import sharedStyles from './RichEditorTooltip.module.scss';

export type OwnProps = {
  isOpen: boolean;
  selectedIndex: number;
  botCommands?: ApiBotCommand[];
  quickReplies?: ApiQuickReply[];
  quickReplyMessages?: Record<number, ApiMessage>;
  self: ApiUser;
  onCommandSelect: (command: ApiBotCommand) => void;
  onQuickReplySelect: (quickReply: ApiQuickReply) => void;
};

type QuickReplyWithDescription = {
  quickReply: ApiQuickReply;
  command: string;
  description: string;
};

const ChatCommandTooltip = (props: OwnProps) => {
  const isClosing = () => !props.isOpen;
  const selectedIndex = frozenWhile(() => props.selectedIndex, isClosing);
  const botCommands = frozenWhile(() => props.botCommands, isClosing);
  const quickReplies = frozenWhile(() => props.quickReplies, isClosing);
  const quickReplyMessages = frozenWhile(() => props.quickReplyMessages, isClosing);
  const self = frozenWhile(() => props.self, isClosing);
  const onCommandSelect = frozenWhile(() => props.onCommandSelect, isClosing);
  const onQuickReplySelect = frozenWhile(() => props.onQuickReplySelect, isClosing);

  const global = useGlobal();

  let containerRef!: HTMLDivElement;

  const handleSendCommand = (command: ApiBotCommand) => onCommandSelect()(command);
  const handleSendQuickReply = (quickReply: ApiQuickReply) => onQuickReplySelect()(quickReply);

  const quickRepliesWithDescription = createMemo(() => {
    const replies = quickReplies();
    const messages = quickReplyMessages();
    if (!replies?.length || !messages) return undefined;
    return replies.map((reply) => {
      const message = messages[reply.topMessageId];
      return {
        quickReply: reply,
        command: reply.shortcut,
        description: message?.content.text?.text || '',
      } satisfies QuickReplyWithDescription;
    });
  });

  const isEmpty = createMemo(() => !botCommands()?.length && !quickReplies()?.length);

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
    <Show when={!isEmpty()}>
      <RichEditorTooltipPanel isOpen={props.isOpen}>
        <div ref={containerRef} class={buildClassName(sharedStyles.root, 'composer-tooltip custom-scroll')}>
          <For each={quickRepliesWithDescription()} keyed={(reply) => `quickReply_${reply.quickReply.id}`}>
            {(reply, index) => (
              <ChatCommand
                command={reply().command}
                description={reply().description}
                peer={self()}
                withAvatar
                clickArg={reply().quickReply}
                onClick={handleSendQuickReply}
                focus={selectedIndex() === index()}
              />
            )}
          </For>
          <For each={botCommands()} keyed={(command) => `${command.botId}_${command.command}`}>
            {(command, index) => (
              <ChatCommand
                command={command().command}
                description={command().description}
                isEphemeral={command().isEphemeral}
                // No need for expensive global updates on users and chats, so we avoid them
                // Deviation: tt read `getGlobal()` on every render; this reads one leaf of the tracked global, so the avatar
                // follows the bot user when it is loaded later.
                peer={global.users.byId[command().botId]}
                withAvatar
                clickArg={command()}
                onClick={handleSendCommand}
                focus={selectedIndex() - (quickRepliesWithDescription()?.length || 0) === index()}
              />
            )}
          </For>
        </div>
      </RichEditorTooltipPanel>
    </Show>
  );
};

export default ChatCommandTooltip;
