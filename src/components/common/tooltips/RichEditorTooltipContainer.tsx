import type { Editor } from '@tiptap/core';
import { createEffect, createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import type { GlobalState } from '../../../global/types';

import type {
  ApiBotCommand,
  ApiBotInlineMediaResult,
  ApiBotInlineResult,
  ApiQuickReply,
  ApiSticker,
  ApiUser,
} from '../../../api/types';
import type {
  RichEditorFormatterState,
  RichEditorTooltipContext,
  RichEditorTooltipItem,
  RichEditorTooltipsConfig,
  RichEditorTooltipSuggestion,
  RichEditorTooltipSurface,
} from './types';

import { selectTabState } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { parseInlineBotQuery } from './extensions/richEditorTooltips/suggestion';

import TextFormatter from '../../ui/textInput/TextFormatter';
import ChatCommandTooltip from './ChatCommandTooltip.async';
import CustomEmojiTooltip from './CustomEmojiTooltip.async';
import EmojiTooltip from './EmojiTooltip.async';
import InlineBotTooltip from './InlineBotTooltip.async';
import MentionTooltip from './MentionTooltip.async';
import RichEditorTooltipPanel from './RichEditorTooltipPanel';
import StickerTooltip from './StickerTooltip.async';

import styles from './RichEditorTooltipContainer.module.scss';

const RE_MULTIPLE_NEWLINES = /\n{2,}/;

export type OwnProps = {
  editor: Editor;
  surface?: RichEditorTooltipSurface;
  suggestion?: RichEditorTooltipSuggestion;
  customEmojiSuggestion?: RichEditorTooltipSuggestion;
  stickerSuggestion?: RichEditorTooltipSuggestion;
  formatter?: RichEditorFormatterState;
  isOpen: boolean;
  isCustomEmojiOpen: boolean;
  isStickerOpen: boolean;
  isFormatterOpen: boolean;
  selectedIndex: number;
  config: RichEditorTooltipsConfig;
  context: RichEditorTooltipContext;
  onCloseFormatter: NoneToVoidFunction;
  onFormatterDismissalChange: (isBlocked: boolean) => void;
};

type StateProps = {
  customEmoji?: ApiSticker[];
  stickers?: ApiSticker[];
  inlineBots?: RichEditorTooltipContext['inlineBots'];
};

const RichEditorTooltipContainer = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { queryInlineBot } = getActions();

  const inlineBotState = createMemo(() =>
    props.surface === 'inlineBot' ? parseInlineBotQuery(props.suggestion?.text) : undefined,
  );
  const inlineBot = createMemo(() =>
    inlineBotState() ? props.inlineBots?.[inlineBotState().username.toLowerCase()] || undefined : undefined,
  );
  const canShowInlineBotHelp = createMemo(
    () => inlineBotState()?.query === '' && !RE_MULTIPLE_NEWLINES.test(props.suggestion?.text || ''),
  );
  const inlineBotHelp = createMemo(() => (canShowInlineBotHelp() && inlineBot() ? inlineBot().help : undefined));
  const inlineBotUsername = createMemo(() => inlineBotState()?.username);
  const onInlineBotHelpChange = createMemo(() => props.config.inlineBot?.onHelpChange);

  const handleMentionSelect = (user: ApiUser) => props.suggestion?.command(user);
  const handleEmojiSelect = (emoji: string) => {
    const item = props.suggestion ? findEmojiItem(props.suggestion.items, emoji) : undefined;
    if (item) {
      props.suggestion!.command(item);
    }
  };
  const handleCustomEmojiSelect = (emoji: ApiSticker) => props.suggestion?.command(emoji);
  const handleStickerSelect = (sticker: ApiSticker, isSilent?: boolean, shouldSchedule?: boolean) =>
    props.config.sticker?.onSelect(sticker, isSilent, shouldSchedule);
  const handleStackCustomEmojiSelect = (emoji: ApiSticker) => props.customEmojiSuggestion?.command(emoji);
  const handleCommandSelect = (command: ApiBotCommand) => props.suggestion?.command(command);
  const handleQuickReplySelect = (quickReply: ApiQuickReply) => props.suggestion?.command(quickReply);
  const handleInlineBotLoadMore = () => {
    if (!inlineBotState() || !inlineBot()) {
      return;
    }

    queryInlineBot({
      chatId: props.context.chatId,
      username: inlineBotState().username.toLowerCase(),
      query: inlineBotState().query,
      offset: inlineBot().offset,
    });
  };
  const handleInlineBotResultSelect = (
    result: ApiBotInlineResult | ApiBotInlineMediaResult,
    isSilent?: boolean,
    shouldSchedule?: boolean,
  ) => {
    if (inlineBot()) {
      props.config.inlineBot?.onSelect(inlineBot().id, result, isSilent, shouldSchedule);
    }
  };

  createEffect(
    depsOf(() => [inlineBotHelp(), inlineBotUsername(), onInlineBotHelpChange()] as const),
    ([inlineBotHelp2, inlineBotUsername2, onInlineBotHelpChange2]) => {
      onInlineBotHelpChange2?.(
        inlineBotHelp2 && inlineBotUsername2 ? `@${inlineBotUsername2} ${inlineBotHelp2}` : undefined,
      );
      return () => onInlineBotHelpChange2?.();
    },
  );

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.formatter && !props.editor.isDestroyed) {
    return (
      <div class={styles.formatter}>
        <RichEditorTooltipPanel isOpen={props.isFormatterOpen}>
          <TextFormatter
            editor={props.editor}
            range={props.formatter.range}
            capabilities={props.formatter.capabilities}
            controlRequest={props.formatter.controlRequest}
            isRichInputExpanded={props.context.isRichInputExpanded}
            onClose={props.onCloseFormatter}
            onDismissalChange={props.onFormatterDismissalChange}
          />
        </RichEditorTooltipPanel>
      </div>
    );
  }

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (!props.surface || !props.suggestion) {
    return undefined;
  }

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.surface === 'mention') {
    return (
      <div class={buildClassName(styles.root, styles.compact)}>
        <MentionTooltip
          isOpen={props.isOpen}
          selectedIndex={props.selectedIndex}
          filteredUsers={props.suggestion.items as ApiUser[]}
          onInsertUserName={handleMentionSelect}
        />
      </div>
    );
  }

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.surface === 'emoji') {
    if (!props.config.emoji) {
      return undefined;
    }

    const emojis = props.suggestion.items.filter((item): item is Emoji => 'native' in item);
    const customEmojis = props.suggestion.items.filter((item): item is ApiSticker => !('native' in item));

    return (
      <div class={styles.root}>
        <EmojiTooltip
          isOpen={props.isOpen}
          selectedIndex={props.selectedIndex}
          emojis={emojis}
          customEmojis={customEmojis}
          onEmojiSelect={handleEmojiSelect}
          onCustomEmojiSelect={handleCustomEmojiSelect}
        />
      </div>
    );
  }

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.surface === 'customEmoji' || props.surface === 'sticker') {
    const customEmojiConfig = props.config.customEmoji;
    return (
      <div class={styles.emojiStack}>
        {props.stickerSuggestion ? (
          <StickerTooltip
            isOpen={props.isStickerOpen}
            chatId={props.context.chatId}
            threadId={props.context.threadId}
            stickers={props.stickers}
            isSavedMessages={props.context.isSavedMessages}
            isCurrentUserPremium={props.context.isCurrentUserPremium}
            onStickerSelect={handleStickerSelect}
          />
        ) : undefined}
        {props.customEmojiSuggestion && customEmojiConfig ? (
          <CustomEmojiTooltip
            isOpen={props.isCustomEmojiOpen}
            customEmoji={props.customEmoji}
            isSavedMessages={props.context.isSavedMessages}
            isCurrentUserPremium={props.context.isCurrentUserPremium}
            addRecentCustomEmoji={customEmojiConfig.addRecentCustomEmoji}
            onCustomEmojiSelect={handleStackCustomEmojiSelect}
          />
        ) : undefined}
      </div>
    );
  }

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (props.surface === 'command' && props.context.currentUser) {
    const botCommands = props.suggestion.items.filter((item): item is ApiBotCommand => 'botId' in item);
    const filteredQuickReplies = props.suggestion.items.filter((item): item is ApiQuickReply => 'shortcut' in item);

    return (
      <div class={buildClassName(styles.root, styles.compact, styles.command)}>
        <ChatCommandTooltip
          isOpen={props.isOpen}
          selectedIndex={props.selectedIndex}
          botCommands={botCommands}
          quickReplies={filteredQuickReplies}
          quickReplyMessages={props.context.quickReplyMessages}
          self={props.context.currentUser}
          onCommandSelect={handleCommandSelect}
          onQuickReplySelect={handleQuickReplySelect}
        />
      </div>
    );
  }

  return (
    <Show
      when={!(props.surface === 'inlineBot' && inlineBot() && inlineBotState())}
      fallback={
        <div class={styles.root}>
          <InlineBotTooltip
            isOpen={props.isOpen}
            selectedIndex={props.selectedIndex}
            botId={inlineBot().id}
            isGallery={inlineBot().isGallery}
            inlineBotResults={inlineBot().results}
            switchPm={inlineBot().switchPm}
            switchWebview={inlineBot().switchWebview}
            isSavedMessages={props.context.isSavedMessages}
            canSendGifs={props.context.canSendGifs}
            isCurrentUserPremium={props.context.isCurrentUserPremium}
            loadMore={handleInlineBotLoadMore}
            onSelectResult={handleInlineBotResultSelect}
          />
        </div>
      }
    >
      {undefined}
    </Show>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const tabState = selectTabState(global);
  return {
    customEmoji: global.customEmojis.forEmoji.stickers,
    stickers: global.stickers.forEmoji.stickers,
    inlineBots: tabState.inlineBots.byUsername,
  };
};

export default RichEditorTooltipContainer;

function findEmojiItem(items: RichEditorTooltipItem[], native: string) {
  return items.find((item): item is Emoji => 'native' in item && item.native === native);
}
