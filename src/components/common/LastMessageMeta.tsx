import { createMemo } from 'frameact';

import type { ApiMessage, ApiMessageOutgoingStatus } from '../../api/types';

import buildClassName from '../../util/buildClassName';
import { formatPastTimeShort } from '../../util/dates/oldDateFormat';

import useOldLang from '../../hooks/useOldLang';

import MessageOutgoingStatus from './MessageOutgoingStatus';

import './LastMessageMeta.scss';

type OwnProps = {
  className?: string;
  message: ApiMessage;
  outgoingStatus?: ApiMessageOutgoingStatus;
  draftDate?: number;
};

const LastMessageMeta = (props: OwnProps) => {
  const lang = useOldLang();

  const shouldUseDraft = createMemo(() => props.draftDate && props.draftDate > props.message.date);
  return (
    <div class={buildClassName('LastMessageMeta', props.className)}>
      {props.outgoingStatus && !shouldUseDraft() && <MessageOutgoingStatus status={props.outgoingStatus} />}
      <span class="time">
        {formatPastTimeShort(lang, (shouldUseDraft() ? props.draftDate! : props.message.date) * 1000)}
      </span>
    </div>
  );
};

export default LastMessageMeta;
