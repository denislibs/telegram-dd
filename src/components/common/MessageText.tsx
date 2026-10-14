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
  const text = () => source().text;
  const entities = () => source().entities;

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
    if (props.shouldAnimateTyping) {
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
      highlight: props.highlight,
      emojiSize: props.emojiSize,
      shouldRenderAsHtml: props.shouldRenderAsHtml,
      containerId,
      asPreview: props.asPreview,
      isProtected: props.isProtected,
      observeIntersectionForLoading: props.observeIntersectionForLoading,
      observeIntersectionForPlaying: props.observeIntersectionForPlaying,
      withTranslucentThumbs: props.withTranslucentThumbs,
      // Deviation: tt passed `useRef` objects; the canvas refs are accessors (as `CustomEmoji.sharedCanvasRef`)
      sharedCanvasRef: withSharedCanvas() ? () => sharedCanvasRef : undefined,
      sharedCanvasHqRef: withSharedCanvas() ? () => sharedCanvasHqRef : undefined,
      cacheBuster: textCacheBuster().toString(),
      forcePlayback: props.forcePlayback,
      isInSelectMode: props.isInSelectMode,
      maxTimestamp: props.maxTimestamp,
      chatId: 'chatId' in props.messageOrStory ? props.messageOrStory.chatId : undefined,
      messageId: props.messageOrStory.id,
      threadId: props.threadId,
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
          props.shouldAnimateTyping ? (
            <TypingWrapper
              formattedText={textToRender()}
              renderText={renderText}
              shouldAnimateMask={props.canAnimateTextStreaming}
              noInitialAnimation={props.noInitialTypingAnimation}
              shouldRenderPlaceholder={shouldRenderTypingPlaceholder()}
              onCompleted={props.onTypingAnimationEnd}
              completionKey={props.messageOrStory.id}
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
