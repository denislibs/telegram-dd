import { type Accessor, getOwner } from 'frameact';
import { getActions } from '../../../global';

import type { ApiMessageEntity, ApiMessageEntityFormattedDate } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { TextPart, ThreadId } from '../../../types';
import type { TextFilter } from './renderText';
import { ApiMessageEntityTypes } from '../../../api/types';

import { generateBrailleSpoiler } from '../../../global/helpers/messageSummary';
import { ensureProtocol } from '../../../util/browser/url';
import buildClassName from '../../../util/buildClassName';
import { copyTextToClipboard } from '../../../util/clipboard';
import { buildFormattedDateHtml } from '../../../util/dates/formattedDate';
import { escapeHtmlAttribute } from '../../middle/composer/helpers/cleanHtml';
import { buildCustomEmojiHtmlFromEntity } from '../../middle/composer/helpers/customEmoji';
import renderText from './renderText';

import MentionLink from '../../middle/message/MentionLink';
import CodeBlock from '../code/CodeBlock';
import CustomEmoji from '../CustomEmoji';
import FormattedDate from '../FormattedDate';
import Blockquote from '../quote/Blockquote';
import SafeLink from '../SafeLink';
import Spoiler from '../spoiler/Spoiler';
import TonAddressLink from '../TonAddressLink';

interface IOrganizedEntity {
  entity: ApiMessageEntity;
  organizedIndexes: Set<number>;
  nestedEntities: IOrganizedEntity[];
}
type RenderTextParams = Parameters<typeof renderText>[2];

const HQ_EMOJI_THRESHOLD = 64;

// Deviation (untrusted entities): the entities of a message come from the server. More than `MAX_ENTITIES` are ignored
// (the text between them stays plain), nested entities are rendered up to `MAX_NESTING_DEPTH` levels (a deeper
// entity is rendered as plain text of its range), and entities with a range outside the text are dropped.
// Telegram itself allows far fewer entities per message and a few levels of nesting.
const MAX_ENTITIES = 2048;
const MAX_NESTING_DEPTH = 32;
// A custom emoji id is a 64-bit integer as a decimal string
const CUSTOM_EMOJI_ID_REGEX = /^-?\d{1,20}$/;
// The latest time (in seconds) that a Date can hold: the formatting of a later one throws
const MAX_DATE_SECONDS = 8.64e12;

/** `text` with the ranges of Spoiler entities replaced by braille characters of the same length (overlaps merged). */
export function concealSpoilers(text: string, entities?: ApiMessageEntity[]): string {
  if (!entities?.length) return text;

  const ranges: [number, number][] = [];
  for (const { type, offset, length } of entities) {
    if (type !== ApiMessageEntityTypes.Spoiler) continue;

    // A range that is not a pair of numbers conceals nothing; `Infinity` is clamped to the text
    if (typeof offset !== 'number' || typeof length !== 'number') continue;

    const start = Math.max(0, Math.floor(offset));
    const end = Math.min(text.length, Math.ceil(offset + length));
    if (start < end) ranges.push([start, end]);
  }
  if (!ranges.length) return text;

  ranges.sort((a, b) => a[0] - b[0]);

  let result = '';
  let position = 0;
  for (const [start, end] of ranges) {
    if (end <= position) continue;

    const from = Math.max(start, position);
    result += text.slice(position, from) + generateBrailleSpoiler(end - from);
    position = end;
  }

  return result + text.slice(position);
}

// TODO(port): the nodes are created anew on each call (a text edit re-creates every CustomEmoji/lottie); a `<For>` keyed
// by entity (porting guide 4.2) would keep them. Deviation until then: the callers re-run this function in a binding.
export function renderTextWithEntities({
  text: rawText,
  entities,
  highlight,
  emojiSize,
  shouldRenderAsHtml,
  containerId,
  asPreview,
  isProtected,
  observeIntersectionForLoading,
  observeIntersectionForPlaying,
  withTranslucentThumbs,
  sharedCanvasRef,
  sharedCanvasHqRef,
  forcePlayback,
  noCustomEmojiPlayback,
  isInSelectMode,
  chatId,
  messageId,
  threadId,
  maxTimestamp,
}: {
  text: string;
  entities?: ApiMessageEntity[];
  highlight?: string;
  emojiSize?: number;
  shouldRenderAsHtml?: boolean;
  containerId?: string;
  asPreview?: boolean;
  isProtected?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  withTranslucentThumbs?: boolean;
  sharedCanvasRef?: Accessor<HTMLCanvasElement | undefined>;
  sharedCanvasHqRef?: Accessor<HTMLCanvasElement | undefined>;
  // Deviation: not used. The `key` that tt gave the custom emoji and the date (`${cacheBuster}-${offset}`) to remount
  // them on a text change is gone: the nodes are created anew on each call of this function.
  cacheBuster?: string;
  forcePlayback?: boolean;
  noCustomEmojiPlayback?: boolean;
  // Deviation: an accessor is allowed, so that a toggle of select mode is read by `Blockquote` and does not rebuild the text
  isInSelectMode?: boolean | (() => boolean);
  chatId?: string;
  messageId?: number;
  threadId?: ThreadId;
  maxTimestamp?: number;
}) {
  // Deviation (security): tt renders the text of a Spoiler inside `<Spoiler>`, hidden by CSS only: its characters are
  // in the DOM (`textContent`, copy, screen readers). A preview is always on screen (the chat list: the login code of
  // the 777000 chat is a Spoiler there), so in a preview the text of every Spoiler range is replaced by braille
  // characters of the same length before the entities are rendered, as the plain-string summaries do
  // (`getMessageTextWithSpoilers`). Nothing of the range can come out as plain text, whatever the other entities are
  // (all the entities are used, not only the ones below `MAX_ENTITIES`). The `Spoiler` wrapper (the dots) stays.
  const text = asPreview ? concealSpoilers(rawText, entities) : rawText;
  // Deviation: the components of the result (Spoiler, CustomEmoji, links, ...) live as long as their owner. A helper
  // without one (`getMessageSummaryText` makes the nodes of a poll question and drops them) would leave them
  // subscribed for good, so the text is returned without them. The HTML strings have no components.
  const validEntities =
    entities?.length && (shouldRenderAsHtml || getOwner()) ? sanitizeEntities(text, entities) : undefined;
  if (!validEntities?.length) {
    return renderMessagePart({
      content: text,
      highlight,
      emojiSize,
      shouldRenderAsHtml,
      asPreview,
    });
  }

  const result: TextPart[] = [];
  let deleteLineBreakAfterPre = false;

  const organizedEntities = organizeEntities(validEntities);

  // Recursive function to render regular and nested entities
  function renderEntity(
    textPartStart: number,
    textPartEnd: number,
    organizedEntity: IOrganizedEntity,
    isLastEntity: boolean,
    depth = 0,
  ) {
    const renderResult: TextPart[] = [];
    const { entity, nestedEntities } = organizedEntity;
    const { offset, length, type } = entity;

    // Render text before the entity
    let textBefore = text.substring(textPartStart, offset);
    const textBeforeLength = textBefore.length;
    if (textBefore) {
      if (deleteLineBreakAfterPre && textBefore.length > 0 && textBefore[0] === '\n') {
        textBefore = textBefore.substr(1);
        deleteLineBreakAfterPre = false;
      }
      if (textBefore) {
        renderResult.push(
          ...renderMessagePart({
            content: textBefore,
            highlight,
            emojiSize,
            shouldRenderAsHtml,
            asPreview,
          }),
        );
      }
    }

    const entityStartIndex = textPartStart + textBeforeLength;
    const entityEndIndex = entityStartIndex + length;

    let entityContent: TextPart = text.substring(offset, offset + length);
    const nestedEntityContent: TextPart[] = [];

    if (deleteLineBreakAfterPre && entityContent.length > 0 && entityContent[0] === '\n') {
      entityContent = entityContent.substr(1);
      deleteLineBreakAfterPre = false;
    }

    if (type === ApiMessageEntityTypes.Pre) {
      deleteLineBreakAfterPre = true;
    }

    // Render nested entities, if any
    // Deviation: a depth over `MAX_NESTING_DEPTH` is not rendered
    if (nestedEntities.length && depth < MAX_NESTING_DEPTH) {
      let nestedIndex = entityStartIndex;

      nestedEntities.forEach((nestedEntity, nestedEntityIndex) => {
        const { renderResult: nestedResult, entityEndIndex: nestedEntityEndIndex } = renderEntity(
          nestedIndex,
          entityEndIndex,
          nestedEntity,
          nestedEntityIndex === nestedEntities.length - 1,
          depth + 1,
        );

        nestedEntityContent.push(...nestedResult);
        nestedIndex = nestedEntityEndIndex;
      });
    }

    // Render the entity itself
    const newEntity = shouldRenderAsHtml
      ? processEntityAsHtml(entity, entityContent, nestedEntityContent)
      : processEntity({
          entity,
          entityContent,
          nestedEntityContent,
          highlight,
          containerId,
          asPreview,
          isProtected,
          observeIntersectionForLoading,
          observeIntersectionForPlaying,
          withTranslucentThumbs,
          emojiSize,
          sharedCanvasRef,
          sharedCanvasHqRef,
          forcePlayback,
          noCustomEmojiPlayback,
          isInSelectMode,
          chatId,
          messageId,
          threadId,
          maxTimestamp,
        });

    if (Array.isArray(newEntity)) {
      renderResult.push(...newEntity);
    } else {
      renderResult.push(newEntity);
    }

    // Render text after the entity, if it is the last entity in the text,
    // or the last nested entity inside of another entity
    if (isLastEntity && entityEndIndex < textPartEnd) {
      let textAfter = text.substring(entityEndIndex, textPartEnd);
      if (deleteLineBreakAfterPre && textAfter.length > 0 && textAfter[0] === '\n') {
        textAfter = textAfter.substring(1);
      }
      if (textAfter) {
        renderResult.push(
          ...renderMessagePart({
            content: textAfter,
            highlight,
            emojiSize,
            shouldRenderAsHtml,
            asPreview,
          }),
        );
      }
    }

    return {
      renderResult,
      entityEndIndex,
    };
  }

  // Process highest-level entities
  let index = 0;

  organizedEntities.forEach((entity, arrayIndex) => {
    const { renderResult, entityEndIndex } = renderEntity(
      index,
      text.length,
      entity,
      arrayIndex === organizedEntities.length - 1,
    );

    result.push(...renderResult);
    index = entityEndIndex;
  });

  return result;
}

function renderMessagePart({
  content,
  highlight,
  focusedQuote,
  emojiSize,
  shouldRenderAsHtml,
  asPreview,
}: {
  content: TextPart | TextPart[];
  highlight?: string;
  focusedQuote?: string;
  emojiSize?: number;
  shouldRenderAsHtml?: boolean;
  asPreview?: boolean;
}) {
  if (Array.isArray(content)) {
    const result: TextPart[] = [];

    content.forEach((c) => {
      result.push(
        ...renderMessagePart({
          content: c,
          highlight,
          focusedQuote,
          emojiSize,
          shouldRenderAsHtml,
          asPreview,
        }),
      );
    });

    return result;
  }

  if (shouldRenderAsHtml) {
    return renderText(content, ['escape_html', 'emoji_html', 'br_html']);
  }

  const emojiFilter = emojiSize && emojiSize > HQ_EMOJI_THRESHOLD ? 'hq_emoji' : 'emoji';

  const filters: TextFilter[] = [emojiFilter];
  const params: RenderTextParams = {};
  if (!asPreview) {
    filters.push('br');
  }

  if (highlight) {
    filters.push('highlight');
    params.highlight = highlight;
  }

  return renderText(content, filters, params);
}

export function insertTextEntity(entities: ApiMessageEntity[], newEntity: ApiMessageEntity) {
  const resultEntities: ApiMessageEntity[] = [];

  const newEntityStart = newEntity.offset;
  const newEntityEnd = newEntity.offset + newEntity.length;

  for (const existingEntity of entities) {
    const existingEntityStart = existingEntity.offset;
    const existingEntityEnd = existingEntity.offset + existingEntity.length;
    // Push as is if edges do not overlap
    if (
      existingEntityEnd <= newEntityStart ||
      existingEntityStart > newEntityEnd ||
      (existingEntityStart > newEntityStart && existingEntityEnd < newEntityEnd) ||
      (existingEntityStart === newEntityStart && existingEntityEnd === newEntityEnd)
    ) {
      resultEntities.push(existingEntity);
      continue;
    }

    // If start edge overlaps
    if (existingEntityStart < newEntityStart && existingEntityEnd > newEntityStart) {
      // Split entity in two
      resultEntities.push({
        ...existingEntity,
        length: newEntityStart - existingEntityStart,
      });
      resultEntities.push({
        ...existingEntity,
        offset: newEntityStart,
        length: existingEntityEnd - newEntityStart,
      });
    }

    // If end edge overlaps
    if (existingEntityStart < newEntityEnd && existingEntityEnd > newEntityEnd) {
      // Split entity in two
      resultEntities.push({
        ...existingEntity,
        offset: newEntityEnd,
        length: existingEntityEnd - newEntityStart - newEntity.length,
      });
      resultEntities.push({
        ...existingEntity,
        length: newEntityEnd - existingEntityStart,
      });
    }
  }

  resultEntities.push(newEntity);
  // Sort entities by offset, longer entities first
  return resultEntities.sort((a, b) => a.offset - b.offset || b.length - a.length);
}

// Drops the entities that cannot be rendered and caps their number (see `MAX_ENTITIES`)
function sanitizeEntities(text: string, entities: ApiMessageEntity[]) {
  const result: ApiMessageEntity[] = [];

  for (const entity of entities) {
    if (result.length >= MAX_ENTITIES) break;

    const { offset, length } = entity;
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0 || offset >= text.length) {
      continue;
    }

    result.push(offset + length > text.length ? { ...entity, length: text.length - offset } : entity);
  }

  return result;
}

// Organize entities in a tree-like structure to better represent how the text will be displayed
// (exported for the test that compares it with tt's algorithm)
export function organizeEntities(entities: ApiMessageEntity[]) {
  const organizedEntityIndexes = new Set<number>();
  const organizedEntities: IOrganizedEntity[] = [];
  // Deviation: tt computed the tree of an entity again for each entity that contains it, which takes time exponential in
  // the nesting; the result for an index is the same within one top-level call, so it is computed once
  const cache = new Map<number, IOrganizedEntity>();

  entities.forEach((entity, index) => {
    if (organizedEntityIndexes.has(index)) {
      return;
    }

    cache.clear();
    const organizedEntity = organizeEntity(entity, index, entities, organizedEntityIndexes, cache);
    if (organizedEntity) {
      organizedEntity.organizedIndexes.forEach((organizedIndex) => {
        organizedEntityIndexes.add(organizedIndex);
      });

      organizedEntities.push(organizedEntity);
    }
  });

  return organizedEntities;
}

function organizeEntity(
  entity: ApiMessageEntity,
  index: number,
  entities: ApiMessageEntity[],
  organizedEntityIndexes: Set<number>,
  cache: Map<number, IOrganizedEntity>,
): IOrganizedEntity | undefined {
  const { offset, length } = entity;
  const organizedIndexes = new Set([index]);

  if (organizedEntityIndexes.has(index)) {
    return undefined;
  }

  const cached = cache.get(index);
  if (cached) {
    return cached;
  }

  // Determine any nested entities inside current entity
  const nestedEntities: IOrganizedEntity[] = [];
  for (let i = index + 1; i < entities.length; i++) {
    const nestedCandidate = entities[i];
    // Deviation: tt took the index of the candidate with `entities.indexOf` (a candidate that is the same object as an
    // earlier entity sent it into an endless recursion); a nested entity whose index is already in the set of this
    // entity has everything it contains in the set too, so it would not have been added (`isChanged` of tt)
    if (!(nestedCandidate.offset >= offset && nestedCandidate.offset < offset + length) || organizedIndexes.has(i)) {
      continue;
    }

    const parsedEntity = organizeEntity(nestedCandidate, i, entities, organizedEntityIndexes, cache);
    if (!parsedEntity) {
      continue;
    }

    parsedEntity.organizedIndexes.forEach((organizedIndex) => {
      organizedIndexes.add(organizedIndex);
    });

    nestedEntities.push(parsedEntity);
  }

  const organizedEntity = {
    entity,
    organizedIndexes,
    nestedEntities,
  };
  cache.set(index, organizedEntity);

  return organizedEntity;
}

function processEntity({
  entity,
  entityContent,
  nestedEntityContent,
  highlight,
  containerId,
  asPreview,
  isProtected,
  observeIntersectionForLoading,
  observeIntersectionForPlaying,
  withTranslucentThumbs,
  emojiSize,
  sharedCanvasRef,
  sharedCanvasHqRef,
  forcePlayback,
  noCustomEmojiPlayback,
  isInSelectMode,
  chatId,
  messageId,
  threadId,
  maxTimestamp,
}: {
  entity: ApiMessageEntity;
  entityContent: TextPart;
  nestedEntityContent: TextPart[];
  highlight?: string;
  focusedQuote?: string;
  containerId?: string;
  asPreview?: boolean;
  isProtected?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  withTranslucentThumbs?: boolean;
  emojiSize?: number;
  sharedCanvasRef?: Accessor<HTMLCanvasElement | undefined>;
  sharedCanvasHqRef?: Accessor<HTMLCanvasElement | undefined>;
  forcePlayback?: boolean;
  noCustomEmojiPlayback?: boolean;
  // Deviation: an accessor is allowed, so that a toggle of select mode is read by `Blockquote` and does not rebuild the text
  isInSelectMode?: boolean | (() => boolean);
  chatId?: string;
  messageId?: number;
  threadId?: ThreadId;
  maxTimestamp?: number;
}) {
  const entityText = typeof entityContent === 'string' && entityContent;
  const renderedContent = nestedEntityContent.length ? nestedEntityContent : entityContent;

  // Deviation: the part is rendered once per entity. A prop of a component (`<Spoiler>{renderNestedMessagePart()}</Spoiler>`)
  // is a getter that runs the expression on each read, and the nodes it makes can be placed in one spot only.
  let nestedMessagePart: TextPart[] | undefined;
  function renderNestedMessagePart() {
    nestedMessagePart ??= renderMessagePart({
      content: renderedContent,
      highlight,
      emojiSize,
      asPreview,
    });

    return nestedMessagePart;
  }

  if (!entityText) {
    return renderNestedMessagePart();
  }

  if (asPreview) {
    const text = renderNestedMessagePart();
    if (entity.type === ApiMessageEntityTypes.Spoiler) {
      return <Spoiler>{text}</Spoiler>;
    }

    if (entity.type === ApiMessageEntityTypes.CustomEmoji) {
      // Deviation: an id that is not an integer is not a custom emoji (the text is rendered)
      if (!CUSTOM_EMOJI_ID_REGEX.test(entity.documentId)) {
        return text;
      }

      return (
        <CustomEmoji
          documentId={entity.documentId}
          size={emojiSize}
          isSelectable
          withSharedAnimation
          sharedCanvasRef={sharedCanvasRef}
          sharedCanvasHqRef={sharedCanvasHqRef}
          observeIntersectionForLoading={observeIntersectionForLoading}
          observeIntersectionForPlaying={observeIntersectionForPlaying}
          withTranslucentThumb={withTranslucentThumbs}
          forceAlways={forcePlayback}
          noPlay={noCustomEmojiPlayback}
        />
      );
    }

    if (entity.type === ApiMessageEntityTypes.FormattedDate && isValidFormattedDate(entity)) {
      // Old entities can have missing fields
      return (
        <FormattedDate entity={entity} asPreview>
          {text}
        </FormattedDate>
      );
    }

    return text;
  }

  switch (entity.type) {
    case ApiMessageEntityTypes.Bold:
      return <strong data-entity-type={entity.type}>{renderNestedMessagePart()}</strong>;
    case ApiMessageEntityTypes.Blockquote:
      return (
        <Blockquote canBeCollapsible={entity.canCollapse} isToggleDisabled={typeof isInSelectMode === 'function' ? isInSelectMode() : isInSelectMode}>
          {renderNestedMessagePart()}
        </Blockquote>
      );
    case ApiMessageEntityTypes.BotCommand:
      return (
        <a onClick={handleBotCommandClick} class="text-entity-link" dir="auto" data-entity-type={entity.type}>
          {renderNestedMessagePart()}
        </a>
      );
    case ApiMessageEntityTypes.Hashtag: {
      const [tag, username] = entityContent.split('@');
      return (
        <a
          onClick={() => handleHashtagClick(tag, username)}
          class="text-entity-link"
          dir="auto"
          data-entity-type={entity.type}
        >
          {renderNestedMessagePart()}
        </a>
      );
    }
    case ApiMessageEntityTypes.Cashtag: {
      const [tag, username] = entityContent.split('@');
      return (
        <a
          onClick={() => handleHashtagClick(tag, username)}
          class="text-entity-link"
          dir="auto"
          data-entity-type={entity.type}
        >
          {renderNestedMessagePart()}
        </a>
      );
    }
    case ApiMessageEntityTypes.Code:
      return (
        <code
          class={buildClassName('text-entity-code', 'clickable')}
          onClick={handleCodeClick}
          role="textbox"
          tabIndex={0}
          data-entity-type={entity.type}
        >
          {renderNestedMessagePart()}
        </code>
      );
    case ApiMessageEntityTypes.Email:
      return (
        <a
          href={`mailto:${entityText}`}
          target="_blank"
          rel="noopener noreferrer"
          class="text-entity-link"
          dir="auto"
          data-entity-type={entity.type}
        >
          {renderNestedMessagePart()}
        </a>
      );
    case ApiMessageEntityTypes.Italic:
      return <em data-entity-type={entity.type}>{renderNestedMessagePart()}</em>;
    case ApiMessageEntityTypes.MentionName:
      return <MentionLink userId={entity.userId}>{renderNestedMessagePart()}</MentionLink>;
    case ApiMessageEntityTypes.Mention:
      return <MentionLink username={entityText}>{renderNestedMessagePart()}</MentionLink>;
    case ApiMessageEntityTypes.Phone:
      return (
        <a href={`tel:${entityText}`} class="text-entity-link" dir="auto" data-entity-type={entity.type}>
          {renderNestedMessagePart()}
        </a>
      );
    case ApiMessageEntityTypes.TonAddress:
      return (
        <TonAddressLink address={entityText} noCopy={isProtected}>
          {renderNestedMessagePart()}
        </TonAddressLink>
      );
    case ApiMessageEntityTypes.Pre:
      return <CodeBlock text={entityText} language={entity.language} noCopy={isProtected} />;
    case ApiMessageEntityTypes.Strike:
      return <del data-entity-type={entity.type}>{renderNestedMessagePart()}</del>;
    case ApiMessageEntityTypes.TextUrl:
    case ApiMessageEntityTypes.Url:
      return (
        <SafeLink
          url={getLinkUrl(entityText, entity)}
          text={entityText}
          chatId={chatId}
          messageId={messageId}
          threadId={threadId}
          entityType={entity.type}
        >
          {renderNestedMessagePart()}
        </SafeLink>
      );
    case ApiMessageEntityTypes.Underline:
      return <ins data-entity-type={entity.type}>{renderNestedMessagePart()}</ins>;
    case ApiMessageEntityTypes.Timestamp:
      if (!chatId || !messageId || !maxTimestamp || entity.timestamp > maxTimestamp) {
        return renderNestedMessagePart();
      }

      return (
        <a
          onClick={() => handleTimecodeClick(chatId, messageId, threadId, entity.timestamp)}
          class="text-entity-link"
          dir="auto"
          data-entity-type={entity.type}
        >
          {renderNestedMessagePart()}
        </a>
      );
    case ApiMessageEntityTypes.Spoiler:
      return <Spoiler containerId={containerId}>{renderNestedMessagePart()}</Spoiler>;
    case ApiMessageEntityTypes.CustomEmoji:
      if (!CUSTOM_EMOJI_ID_REGEX.test(entity.documentId)) {
        return renderNestedMessagePart();
      }

      return (
        <CustomEmoji
          documentId={entity.documentId}
          size={emojiSize}
          isSelectable
          withSharedAnimation
          sharedCanvasRef={sharedCanvasRef}
          sharedCanvasHqRef={sharedCanvasHqRef}
          observeIntersectionForLoading={observeIntersectionForLoading}
          observeIntersectionForPlaying={observeIntersectionForPlaying}
          withTranslucentThumb={withTranslucentThumbs}
          forceAlways={forcePlayback}
          noPlay={noCustomEmojiPlayback}
        />
      );
    case ApiMessageEntityTypes.QuoteFocus:
      return <span class="matching-text-highlight is-quote">{renderNestedMessagePart()}</span>;
    case ApiMessageEntityTypes.FormattedDate:
      // Deviation: a date that cannot be formatted (it would throw) is rendered as the text
      if (!isValidFormattedDate(entity)) {
        return renderNestedMessagePart();
      }

      return (
        <FormattedDate entity={entity} chatId={chatId} messageId={messageId}>
          {renderNestedMessagePart()}
        </FormattedDate>
      );
    case ApiMessageEntityTypes.DiffInsert:
      return (
        <span class="text-entity-diff-insert" data-entity-type={entity.type}>
          {renderNestedMessagePart()}
        </span>
      );
    case ApiMessageEntityTypes.DiffReplace:
      return (
        <span class="text-entity-diff-replace" data-entity-type={entity.type}>
          <span class="text-entity-diff-replace-old">{entity.oldText}</span>
          <span class="text-entity-diff-replace-new">{renderNestedMessagePart()}</span>
        </span>
      );
    case ApiMessageEntityTypes.DiffDelete:
      return (
        <span class="text-entity-diff-delete" data-entity-type={entity.type}>
          {renderNestedMessagePart()}
        </span>
      );
    default:
      return renderNestedMessagePart();
  }
}

function processEntityAsHtml(entity: ApiMessageEntity, entityContent: TextPart, nestedEntityContent: TextPart[]) {
  const rawEntityText = typeof entityContent === 'string' ? entityContent : undefined;

  // Prevent adding newlines when editing
  const content = entity.type === ApiMessageEntityTypes.Pre ? (entityContent as string).trimEnd() : entityContent;

  const renderedContent = nestedEntityContent.length
    ? (nestedEntityContent as string[]).join('')
    : (renderText(content, ['escape_html', 'emoji_html', 'br_html']) as string[]).join('');

  if (!rawEntityText) {
    return renderedContent;
  }

  switch (entity.type) {
    case ApiMessageEntityTypes.Bold:
      return `<b>${renderedContent}</b>`;
    case ApiMessageEntityTypes.Italic:
      return `<i>${renderedContent}</i>`;
    case ApiMessageEntityTypes.Underline:
      return `<u>${renderedContent}</u>`;
    case ApiMessageEntityTypes.Code:
      return `<code class="text-entity-code">${renderedContent}</code>`;
    case ApiMessageEntityTypes.Pre: {
      const languageClass = entity.language ? ` class="language-${escapeHtmlAttribute(entity.language)}"` : '';
      const code = (renderText(content, ['escape_html']) as string[]).join('');
      return `<pre><code${languageClass}>${code}</code></pre>`;
    }
    case ApiMessageEntityTypes.Strike:
      return `<del>${renderedContent}</del>`;
    case ApiMessageEntityTypes.MentionName:
      // Deviation: `userId` is escaped (tt put it into the attribute as it is; the ids are numeric strings, so the result is the same)
      return `<a
        class="text-entity-link"
        data-entity-type="${ApiMessageEntityTypes.MentionName}"
        data-user-id="${escapeHtmlAttribute(entity.userId)}"
        contenteditable="false"
        dir="auto"
      >${renderedContent}</a>`;
    case ApiMessageEntityTypes.Url:
    case ApiMessageEntityTypes.TextUrl:
      return `<a
        class="text-entity-link"
        href="${getHtmlLinkUrl(rawEntityText, entity)}"
        data-entity-type="${entity.type}"
        dir="auto"
      >${renderedContent}</a>`;
    case ApiMessageEntityTypes.Spoiler:
      return `<span
        class="spoiler"
        data-entity-type="${ApiMessageEntityTypes.Spoiler}"
        >${renderedContent}</span>`;
    case ApiMessageEntityTypes.CustomEmoji:
      return buildCustomEmojiHtmlFromEntity(rawEntityText, entity);
    case ApiMessageEntityTypes.Blockquote:
      return `<blockquote
        class="blockquote"
        data-entity-type="${ApiMessageEntityTypes.Blockquote}"
        >${renderedContent}</blockquote>`;
    case ApiMessageEntityTypes.FormattedDate:
      return buildFormattedDateHtml(renderedContent, entity);
    default:
      return renderedContent;
  }
}

function isValidFormattedDate(entity: ApiMessageEntityFormattedDate) {
  return Boolean(entity.date) && Number.isFinite(entity.date) && Math.abs(entity.date) <= MAX_DATE_SECONDS;
}

function getLinkUrl(entityContent: string, entity: ApiMessageEntity) {
  const { type } = entity;
  return type === ApiMessageEntityTypes.TextUrl && entity.url ? entity.url : entityContent;
}

function getHtmlLinkUrl(entityContent: string, entity: ApiMessageEntity) {
  return escapeHtmlAttribute(ensureProtocol(getLinkUrl(entityContent, entity)));
}

function handleBotCommandClick(e: React.MouseEvent<HTMLAnchorElement>) {
  getActions().sendBotCommand({ command: e.currentTarget.innerText });
}

function handleHashtagClick(hashtag?: string, username?: string) {
  if (!hashtag) return;
  if (username) {
    getActions().openChatByUsername({
      username,
      onChatChanged: {
        action: 'searchHashtag',
        payload: { hashtag },
      },
    });
    return;
  }
  getActions().searchHashtag({ hashtag });
}

function handleCodeClick(e: React.MouseEvent<HTMLElement>) {
  copyTextToClipboard(e.currentTarget.innerText);
  getActions().showNotification({
    message: {
      key: 'TextCopied',
    },
  });
}

function handleTimecodeClick(chatId: string, messageId: number, threadId: ThreadId | undefined, timestamp: number) {
  getActions().openMediaFromTimestamp({
    chatId,
    messageId,
    threadId,
    timestamp,
  });
}
