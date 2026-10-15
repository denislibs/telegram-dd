import { createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions } from '../../../global';

import type { ApiAvailableReaction, ApiMessage, ApiMessageOutgoingStatus, ApiThreadInfo } from '../../../api/types';
import type { LangFn } from '../../../util/localization';

import buildClassName from '../../../util/buildClassName';
import { formatDateTimeToString, formatPastTimeShort, formatTime } from '../../../util/dates/oldDateFormat';
import { formatDateTime, isSameLocalDay, secondsToDate } from '../../../util/localization/dateFormat';
import { formatStarsAsIcon } from '../../../util/localization/format';
import { getRepeatPeriodText } from '../../../util/scheduledMessages';
import { formatIntegerCompact } from '../../../util/textFormat';
import renderText from '../../common/helpers/renderText';

import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useOldLang from '../../../hooks/useOldLang';

import AnimatedCounter from '../../common/AnimatedCounter';
import Icon from '../../common/icons/Icon';
import MessageOutgoingStatus from '../../common/MessageOutgoingStatus';

import './MessageMeta.scss';

type OwnProps = {
  message: ApiMessage;
  withReactionOffset?: boolean;
  outgoingStatus?: ApiMessageOutgoingStatus;
  signature?: string;
  availableReactions?: ApiAvailableReaction[];
  noReplies?: boolean;
  repliesThreadInfo?: ApiThreadInfo;
  isTranslated?: boolean;
  isPinned?: boolean;
  withFullDate?: boolean;
  isMessagePrimaryEditedDateEnabled: boolean;
  effectEmoji?: string;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onTranslationClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onEffectClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  renderQuickReactionButton?: () => JSX.Element | undefined;
  onOpenThread: NoneToVoidFunction;
  paidMessageStars?: number;
};

// Deviation: tt's handlers are typed for a div, the events of the span elements carry their own `currentTarget`.
type MetaClickEvent = React.MouseEvent<HTMLDivElement>;

const MessageMeta = (props: OwnProps) => {
  const { showNotification } = getActions();

  const [isActivated, markActivated] = useFlag();

  const oldLang = useOldLang();
  const lang = useLang();

  function handleImportedClick(e: React.MouseEvent) {
    e.stopPropagation();

    showNotification({
      message: {
        key: 'ImportedInfo',
      },
    });
  }

  function handleOpenThread(e: React.MouseEvent) {
    e.stopPropagation();
    props.onOpenThread();
  }

  const repeatPeriodText = createMemo(() => {
    return getRepeatPeriodText(props.message.scheduleRepeatPeriod, lang);
  });

  const dateTitle = createMemo(() => {
    if (!isActivated()) return undefined;
    const createDateTime = formatDateTimeToString(
      props.message.date * 1000,
      oldLang.code,
      undefined,
      oldLang.timeFormat,
    );
    const editDateTime =
      props.message.isEdited &&
      formatDateTimeToString(props.message.editDate! * 1000, oldLang.code, undefined, oldLang.timeFormat);
    const forwardedDateTime =
      props.message.forwardInfo &&
      formatDateTimeToString(
        (props.message.forwardInfo.savedDate || props.message.forwardInfo.date) * 1000,
        oldLang.code,
        undefined,
        oldLang.timeFormat,
      );

    let text = createDateTime;
    if (editDateTime) {
      text += '\n';
      text += lang('MessageTooltipEditedDate', { date: editDateTime });
    }
    if (forwardedDateTime) {
      text += '\n';
      text += lang('MessageTooltipForwardedDate', { date: forwardedDateTime });
    }

    return text;
  });

  const viewsTitle = createMemo(() => {
    if (!props.message.viewsCount) return undefined;
    let text = lang(
      'MessageTooltipViews',
      {
        count: lang.number(props.message.viewsCount),
      },
      { pluralValue: props.message.viewsCount },
    );
    if (props.message.forwardsCount) {
      text += '\n';
      text += lang(
        'MessageTooltipForwards',
        {
          count: lang.number(props.message.forwardsCount),
        },
        { pluralValue: props.message.forwardsCount },
      );
    }

    return text;
  });

  const repliesTitle = createMemo(() => {
    const count = props.repliesThreadInfo?.messagesCount;
    if (!count) return undefined;
    return lang('MessageTooltipReplies', { count }, { pluralValue: count });
  });

  const shouldShowPrimaryEditedDate = createMemo(() =>
    Boolean(props.message.isEdited && props.isMessagePrimaryEditedDateEnabled),
  );

  const date = createMemo(() => {
    if (shouldShowPrimaryEditedDate()) {
      return formatEditedDate(
        lang,
        props.message.date,
        props.message.editDate!,
        props.withFullDate,
        props.message.isVideoProcessingPending,
      );
    }

    const time = formatTime(oldLang, props.message.date * 1000);
    const baseDate = !props.withFullDate
      ? time
      : formatPastTimeShort(oldLang, (props.message.forwardInfo?.date || props.message.date) * 1000, true);

    if (repeatPeriodText()) {
      return lang('FormatDateAtTime', { date: repeatPeriodText(), time: baseDate });
    }

    return baseDate;
  });

  const fullClassName = createMemo(() =>
    buildClassName(
      'MessageMeta',
      props.withReactionOffset && 'reactions-offset',
      props.message.forwardInfo?.isImported && 'is-imported',
    ),
  );

  return (
    <span
      class={fullClassName()}
      dir={lang.isRtl ? 'rtl' : 'ltr'}
      onClick={(e) => props.onClick(e as unknown as MetaClickEvent)}
      data-ignore-on-paste
    >
      {props.effectEmoji && (
        <span class="message-effect-icon" onClick={(e) => props.onEffectClick(e as unknown as MetaClickEvent)}>
          {renderText(props.effectEmoji)}
        </span>
      )}
      {props.isTranslated && (
        <Icon
          name="language"
          className="message-translated"
          onClick={(e) => props.onTranslationClick(e as unknown as MetaClickEvent)}
        />
      )}
      {Boolean(props.message.viewsCount) && (
        <>
          <span class="message-views" title={viewsTitle()}>
            {formatIntegerCompact(lang, props.message.viewsCount)}
          </span>
          <Icon name="eye" />
        </>
      )}
      {!props.noReplies && Boolean(props.repliesThreadInfo?.messagesCount) && (
        <span onClick={handleOpenThread} class="message-replies-wrapper" title={repliesTitle()}>
          <span class="message-replies">
            <AnimatedCounter text={formatIntegerCompact(lang, props.repliesThreadInfo.messagesCount)} />
          </span>
          <Icon name="reply-filled" />
        </span>
      )}
      {props.isPinned && <Icon name="pin-filled" className="message-pinned" />}
      {props.signature && <span class="message-signature">{renderText(props.signature)}</span>}
      {Boolean(props.paidMessageStars) && (
        <span class="message-price">
          {formatStarsAsIcon(lang, props.paidMessageStars, {
            asFont: true,
          })}
        </span>
      )}
      <span class="message-time" title={dateTitle()} onMouseEnter={markActivated}>
        {Boolean(props.message.anchorMsgId) && `${lang('EphemeralUpdated')} `}
        {props.message.forwardInfo?.isImported && (
          <>
            <span class="message-imported" onClick={handleImportedClick}>
              {formatDateTimeToString(props.message.forwardInfo.date * 1000, lang.code, true)}
            </span>
            <span class="message-imported" onClick={handleImportedClick}>
              {lang('MessageMetaImported')}
            </span>
          </>
        )}
        {props.message.isEdited && !shouldShowPrimaryEditedDate() && `${lang('MessageMetaEdited')} `}
        {props.message.isVideoProcessingPending &&
          !shouldShowPrimaryEditedDate() &&
          `${lang('MessageMetaApproximate')} `}
        {date()}
      </span>
      {props.outgoingStatus && <MessageOutgoingStatus status={props.outgoingStatus} />}
      {props.renderQuickReactionButton && props.renderQuickReactionButton()}
    </span>
  );
};

function formatEditedDate(
  lang: LangFn,
  messageDate: number,
  editDate: number,
  withFullDate?: boolean,
  isApproximate?: boolean,
) {
  const editedDate = secondsToDate(editDate);
  const originalDate = secondsToDate(messageDate);
  const formattedTime = formatDateTime(lang, editedDate, { time: 'short' });
  const time = isApproximate ? `${lang('MessageMetaApproximate')} ${formattedTime}` : formattedTime;
  const shouldShowDate = withFullDate || !isSameLocalDay(editedDate, originalDate);

  if (!shouldShowDate) {
    return lang('MessageMetaEditedAtTime', { time });
  }

  const shouldIncludeYear = editedDate.getFullYear() !== new Date().getFullYear();
  const date = formatDateTime(lang, editedDate, {
    date: 'short',
    includeYear: shouldIncludeYear,
  });

  return lang('MessageMetaEditedOnDateAtTime', { date, time });
}

export default MessageMeta;
