import type { Editor } from '@tiptap/core';
import { createEffect, createMemo } from 'frameact';
import { Match, Show, Switch } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';

import type {
  ApiBotCommand,
  ApiBotInlineMediaResult,
  ApiBotInlineResult,
  ApiQuickReply,
  ApiSticker,
  ApiUser,
} from '../../../api/types';
import type { GlobalState } from '../../../global/types';
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
import { depsOf } from '../../../util/effectDeps';
import { MEMO_EMPTY_ARRAY } from '../../../util/memo';
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

type TooltipKind = 'formatter' | 'mention' | 'emoji' | 'emojiStack' | 'command' | 'inlineBot';

const EMPTY_ITEMS: RichEditorTooltipItem[] = MEMO_EMPTY_ARRAY;

const RichEditorTooltipContainer = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { queryInlineBot } = getActions();

  const inlineBotState = createMemo(
    () => (props.surface === 'inlineBot' ? parseInlineBotQuery(props.suggestion?.text) : undefined),
    { equals: (prev, next) => prev?.username === next?.username && prev?.query === next?.query },
  );
  const inlineBot = createMemo(() => {
    const state = inlineBotState();
    return state ? props.inlineBots?.[state.username.toLowerCase()] || undefined : undefined;
  });
  const canShowInlineBotHelp = createMemo(
    () => inlineBotState()?.query === '' && !RE_MULTIPLE_NEWLINES.test(props.suggestion?.text || ''),
  );
  const inlineBotHelp = createMemo(() => (canShowInlineBotHelp() && inlineBot() ? inlineBot()!.help : undefined));
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
    const state = inlineBotState();
    const bot = inlineBot();
    if (!state || !bot) {
      return;
    }

    queryInlineBot({
      chatId: props.context.chatId,
      username: state.username.toLowerCase(),
      query: state.query,
      offset: bot.offset,
    });
  };
  const handleInlineBotResultSelect = (
    result: ApiBotInlineResult | ApiBotInlineMediaResult,
    isSilent?: boolean,
    shouldSchedule?: boolean,
  ) => {
    const bot = inlineBot();
    if (bot) {
      props.config.inlineBot?.onSelect(bot.id, result, isSilent, shouldSchedule);
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

  // Deviation: tt returned early from the render function; here the same checks, in the same order, pick one branch of
  // the `<Switch>` below (a component runs once, the props change in place).
  const kind = createMemo<TooltipKind | undefined>(() => {
    if (props.formatter && !props.editor.isDestroyed) {
      return 'formatter';
    }

    if (!props.surface || !props.suggestion) {
      return undefined;
    }

    switch (props.surface) {
      case 'mention':
        return 'mention';
      case 'emoji':
        return props.config.emoji ? 'emoji' : undefined;
      case 'customEmoji':
      case 'sticker':
        return 'emojiStack';
      case 'command':
        return props.context.currentUser ? 'command' : undefined;
      case 'inlineBot':
        return inlineBot() && inlineBotState() ? 'inlineBot' : undefined;
      default:
        return undefined;
    }
  });

  const suggestionItems = () => props.suggestion?.items || EMPTY_ITEMS;
  const emojis = createMemo(() => suggestionItems().filter((item): item is Emoji => 'native' in item));
  const customEmojis = createMemo(() => suggestionItems().filter((item): item is ApiSticker => !('native' in item)));
  const botCommands = createMemo(() => suggestionItems().filter((item): item is ApiBotCommand => 'botId' in item));
  const filteredQuickReplies = createMemo(() =>
    suggestionItems().filter((item): item is ApiQuickReply => 'shortcut' in item),
  );

  return (
    <Switch>
      <Match when={kind() === 'formatter' ? props.formatter : undefined}>
        {(formatter) => (
          <div class={styles.formatter}>
            <RichEditorTooltipPanel isOpen={props.isFormatterOpen}>
              <TextFormatter
                editor={props.editor}
                range={formatter().range}
                capabilities={formatter().capabilities}
                controlRequest={formatter().controlRequest}
                isRichInputExpanded={props.context.isRichInputExpanded}
                onClose={props.onCloseFormatter}
                onDismissalChange={props.onFormatterDismissalChange}
              />
            </RichEditorTooltipPanel>
          </div>
        )}
      </Match>
      <Match when={kind() === 'mention'}>
        <div class={buildClassName(styles.root, styles.compact)}>
          <MentionTooltip
            isOpen={props.isOpen}
            selectedIndex={props.selectedIndex}
            filteredUsers={suggestionItems() as ApiUser[]}
            onInsertUserName={handleMentionSelect}
          />
        </div>
      </Match>
      <Match when={kind() === 'emoji'}>
        <div class={styles.root}>
          <EmojiTooltip
            isOpen={props.isOpen}
            selectedIndex={props.selectedIndex}
            emojis={emojis()}
            customEmojis={customEmojis()}
            onEmojiSelect={handleEmojiSelect}
            onCustomEmojiSelect={handleCustomEmojiSelect}
          />
        </div>
      </Match>
      <Match when={kind() === 'emojiStack'}>
        <div class={styles.emojiStack}>
          <Show when={props.stickerSuggestion}>
            <StickerTooltip
              isOpen={props.isStickerOpen}
              chatId={props.context.chatId}
              threadId={props.context.threadId}
              stickers={props.stickers}
              isSavedMessages={props.context.isSavedMessages}
              isCurrentUserPremium={props.context.isCurrentUserPremium}
              onStickerSelect={handleStickerSelect}
            />
          </Show>
          <Show when={props.customEmojiSuggestion && props.config.customEmoji}>
            {(customEmojiConfig) => (
              <CustomEmojiTooltip
                isOpen={props.isCustomEmojiOpen}
                customEmoji={props.customEmoji}
                isSavedMessages={props.context.isSavedMessages}
                isCurrentUserPremium={props.context.isCurrentUserPremium}
                addRecentCustomEmoji={customEmojiConfig().addRecentCustomEmoji}
                onCustomEmojiSelect={handleStackCustomEmojiSelect}
              />
            )}
          </Show>
        </div>
      </Match>
      <Match when={kind() === 'command' ? props.context.currentUser : undefined}>
        {(currentUser) => (
          <div class={buildClassName(styles.root, styles.compact, styles.command)}>
            <ChatCommandTooltip
              isOpen={props.isOpen}
              selectedIndex={props.selectedIndex}
              botCommands={botCommands()}
              quickReplies={filteredQuickReplies()}
              quickReplyMessages={props.context.quickReplyMessages}
              self={currentUser()}
              onCommandSelect={handleCommandSelect}
              onQuickReplySelect={handleQuickReplySelect}
            />
          </div>
        )}
      </Match>
      <Match when={kind() === 'inlineBot' ? inlineBot() : undefined}>
        {(bot) => (
          <div class={styles.root}>
            <InlineBotTooltip
              isOpen={props.isOpen}
              selectedIndex={props.selectedIndex}
              botId={bot().id}
              isGallery={bot().isGallery}
              inlineBotResults={bot().results}
              switchPm={bot().switchPm}
              switchWebview={bot().switchWebview}
              isSavedMessages={props.context.isSavedMessages}
              canSendGifs={props.context.canSendGifs}
              isCurrentUserPremium={props.context.isCurrentUserPremium}
              loadMore={handleInlineBotLoadMore}
              onSelectResult={handleInlineBotResultSelect}
            />
          </div>
        )}
      </Match>
    </Switch>
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
