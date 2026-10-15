import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';

import type { ApiFormattedText, ApiMessage, ApiMessageEntity, ApiStory } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';
import type { ThreadId } from '../../types';
import { ApiMessageEntityTypes } from '../../api/types';

import { extractMessageText, stripCustomEmoji } from '../../global/helpers';
import trimText from '../../util/trimText';
import { insertTextEntity, renderTextWithEntities } from './helpers/renderTextWithEntities';

import useLang from '../../hooks/useLang';
import useUniqueId from '../../hooks/useUniqueId';

import TypingWrapper from './TypingWrapper';

interface OwnProps {
  messageOrStory: ApiMessage | ApiStory;
  threadId?: ThreadId;
  forcedText?: ApiFormattedText;
  isForAnimation?: boolean;
  emojiSize?: number;
  highlight?: string;
  asPreview?: boolean;
  truncateLength?: number;
  isProtected?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  withTranslucentThumbs?: boolean;
  shouldRenderAsHtml?: boolean;
  inChatList?: boolean;
  forcePlayback?: boolean;
  focusedQuote?: string;
  focusedQuoteOffset?: number;
  isInSelectMode?: boolean;
  canBeEmpty?: boolean;
  maxTimestamp?: number;
  shouldAnimateTyping?: boolean;
  noInitialTypingAnimation?: boolean;
  canAnimateTextStreaming?: boolean;
  onTypingAnimationEnd?: NoneToVoidFunction;
}

const MIN_CUSTOM_EMOJIS_FOR_SHARED_CANVAS = 3;

function MessageText(props: OwnProps) {
  let sharedCanvasRef!: HTMLCanvasElement;
  let sharedCanvasHqRef!: HTMLCanvasElement;

  let textCacheBusterRef = 0;

  const lang = useLang();

  const formattedText = createMemo(
    () => props.forcedText || extractMessageText(props.messageOrStory, props.inChatList),
  );
  const adaptedFormattedText = createMemo(() => {
    const current = formattedText();
    return props.isForAnimation && current ? stripCustomEmoji(current) : current;
  });
  const source = createMemo((): Partial<ApiFormattedText> => adaptedFormattedText() || {});
  // Deviation: memos, not plain functions, and every input of the render binding below goes through a memo. teact reconciled a
  // re-render, so the `Spoiler` / `Blockquote` / `CodeBlock` instances (and their state: a revealed spoiler, an expanded quote)
  // survived a views / reactions / read-flag update of the message and the toggling of select mode. Here the nodes are rebuilt
  // whenever anything the binding reads changes, and a plain `props.x` read re-runs it when the parent's getter re-evaluates
  // (a prop that forwards a store field of the message does, whenever the message object is replaced), even if the value is
  // equal. A memo stops the propagation of an equal value; `extractMessageText` returns a new object on each call, but `text`
  // (a string) and `entities` (the array of the message's own content) stay `===` across such updates.
  const text = createMemo(() => source().text);
  const entities = createMemo(() => source().entities);
  const chatId = createMemo(() => ('chatId' in props.messageOrStory ? props.messageOrStory.chatId : undefined));
  const messageId = createMemo(() => props.messageOrStory.id);
  const shouldAnimateTyping = createMemo(() => Boolean(props.shouldAnimateTyping));
  const highlight = createMemo(() => props.highlight);
  const emojiSize = createMemo(() => props.emojiSize);
  const shouldRenderAsHtml = createMemo(() => props.shouldRenderAsHtml);
  const asPreview = createMemo(() => props.asPreview);
  const isProtected = createMemo(() => props.isProtected);
  const observeIntersectionForLoading = createMemo(() => props.observeIntersectionForLoading);
  const observeIntersectionForPlaying = createMemo(() => props.observeIntersectionForPlaying);
  const withTranslucentThumbs = createMemo(() => props.withTranslucentThumbs);
  const forcePlayback = createMemo(() => props.forcePlayback);
  const maxTimestamp = createMemo(() => props.maxTimestamp);
  const threadId = createMemo(() => props.threadId);

  const entitiesWithFocusedQuote = createMemo(() => {
    const currentText = text();
    if (!currentText || !props.focusedQuote) return entities();

    const offsetIndex = currentText.indexOf(props.focusedQuote, props.focusedQuoteOffset);
    const index = offsetIndex >= 0 ? offsetIndex : currentText.indexOf(props.focusedQuote); // Fallback to first occurrence
    const lendth = props.focusedQuote.length;
    if (index >= 0) {
      return insertTextEntity(entities() || [], {
        offset: index,
        length: lendth,
        type: ApiMessageEntityTypes.QuoteFocus,
      });
    }

    return entities();
  });

  const containerId = useUniqueId();

  // tt bumped the counter in `useSyncEffect` during render, before the text was rendered: a memo that the render reads
  const textCacheBuster = createMemo(() => {
    text();
    entitiesWithFocusedQuote();
    textCacheBusterRef += 1;
    return textCacheBusterRef;
  });

  const withSharedCanvas = createMemo(() => {
    if (shouldAnimateTyping()) {
      return false;
    }

    const customEmojisCount = countCustomEmojis(entitiesWithFocusedQuote());
    return (
      customEmojisCount >= MIN_CUSTOM_EMOJIS_FOR_SHARED_CANVAS && !hasSpoileredCustomEmojis(entitiesWithFocusedQuote())
    );
  });

  const renderText = (t: ApiFormattedText) => {
    return renderTextWithEntities({
      text: t.text,
      entities: t.entities,
      highlight: highlight(),
      emojiSize: emojiSize(),
      shouldRenderAsHtml: shouldRenderAsHtml(),
      containerId,
      asPreview: asPreview(),
      isProtected: isProtected(),
      observeIntersectionForLoading: observeIntersectionForLoading(),
      observeIntersectionForPlaying: observeIntersectionForPlaying(),
      withTranslucentThumbs: withTranslucentThumbs(),
      // Deviation: tt passed `useRef` objects; the canvas refs are accessors (as `CustomEmoji.sharedCanvasRef`)
      sharedCanvasRef: withSharedCanvas() ? () => sharedCanvasRef : undefined,
      sharedCanvasHqRef: withSharedCanvas() ? () => sharedCanvasHqRef : undefined,
      cacheBuster: textCacheBuster().toString(),
      forcePlayback: forcePlayback(),
      // Deviation: an accessor (see `isInSelectMode` of `renderTextWithEntities`): entering select mode must not rebuild the text
      isInSelectMode: () => Boolean(props.isInSelectMode),
      maxTimestamp: maxTimestamp(),
      chatId: chatId(),
      messageId: messageId(),
      threadId: threadId(),
    });
  };

  const textToRender = createMemo<ApiFormattedText>(() => ({
    text: trimText(text() || '', props.truncateLength),
    entities: entitiesWithFocusedQuote(),
  }));
  const shouldRenderTypingPlaceholder = createMemo(
    () => !('previousLocalId' in props.messageOrStory) || !props.messageOrStory.previousLocalId,
  );

  return (
    <Show
      when={!(!text() && !props.canBeEmpty)}
      fallback={<span class="content-unsupported">{lang('MessageUnsupported')}</span>}
    >
      <>
        {[
          withSharedCanvas() && <canvas ref={sharedCanvasRef} class="shared-canvas" />,
          withSharedCanvas() && <canvas ref={sharedCanvasHqRef} class="shared-canvas" />,
          shouldAnimateTyping() ? (
            <TypingWrapper
              formattedText={textToRender()}
              renderText={renderText}
              shouldAnimateMask={props.canAnimateTextStreaming}
              noInitialAnimation={props.noInitialTypingAnimation}
              shouldRenderPlaceholder={shouldRenderTypingPlaceholder()}
              onCompleted={props.onTypingAnimationEnd}
              completionKey={messageId()}
            />
          ) : (
            renderText(textToRender())
          ),
        ]
          .flat()
          .filter(Boolean)}
      </>
    </Show>
  );
}

function countCustomEmojis(entities?: ApiMessageEntity[]) {
  return entities?.filter((entity) => entity.type === ApiMessageEntityTypes.CustomEmoji).length || 0;
}

function hasSpoileredCustomEmojis(entities?: ApiMessageEntity[]) {
  const spoilers = entities?.filter((entity) => entity.type === ApiMessageEntityTypes.Spoiler);
  if (!spoilers?.length) {
    return false;
  }

  return Boolean(
    entities?.some((entity) => {
      if (entity.type !== ApiMessageEntityTypes.CustomEmoji) {
        return false;
      }

      return spoilers.some((spoiler) => {
        return entity.offset >= spoiler.offset && entity.offset + entity.length <= spoiler.offset + spoiler.length;
      });
    }),
  );
}

export default MessageText;
