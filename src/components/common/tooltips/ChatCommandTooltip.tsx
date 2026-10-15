import { createMeasureEffect, createMemo, frozenWhile } from 'frameact';
import { For, Show, splitProps } from 'frameact/dom';
import { getGlobal } from '../../../global';

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

const ChatCommandTooltip = (p: OwnProps) => {
  const [, props] = splitProps(p, ['isOpen']);
  const frozen = frozenWhile(
    () => props,
    () => !p.isOpen,
  );
  const selectedIndex = () => frozen().selectedIndex;
  const botCommands = () => frozen().botCommands;
  const quickReplies = () => frozen().quickReplies;
  const quickReplyMessages = () => frozen().quickReplyMessages;
  const self = () => frozen().self;
  const onCommandSelect = () => frozen().onCommandSelect;
  const onQuickReplySelect = () => frozen().onQuickReplySelect;

  let containerRef!: HTMLDivElement;

  const handleSendCommand = (command: ApiBotCommand) => onCommandSelect()(command);
  const handleSendQuickReply = (quickReply: ApiQuickReply) => onQuickReplySelect()(quickReply);

  const quickRepliesWithDescription = createMemo(() => {
    if (!quickReplies()?.length || !quickReplyMessages()) return undefined;
    return quickReplies().map((reply) => {
      const message = quickReplyMessages()[reply.topMessageId];
      return {
        quickReply: reply,
        command: reply.shortcut,
        description: message?.content.text?.text || '',
      } satisfies QuickReplyWithDescription;
    });
  });

  const isEmpty = createMemo(() => !botCommands()?.length && !quickReplies()?.length);

  createMeasureEffect(
    () => selectedIndex(),
    (selectedIndex2) => {
      containerRef?.querySelector<HTMLElement>('.focus')?.scrollIntoView({ block: 'nearest' });
    },
  );

  return (
    <Show when={!isEmpty()}>
      <RichEditorTooltipPanel isOpen={p.isOpen}>
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
              // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
              <ChatCommand
                command={command().command}
                description={command().description}
                isEphemeral={command().isEphemeral}
                // No need for expensive global updates on users and chats, so we avoid them
                peer={getGlobal().users.byId[command().botId]}
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
