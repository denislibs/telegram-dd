import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions } from '../../global';

import buildClassName from '../../util/buildClassName';

import useLang from '../../hooks/useLang';
import { getPeerColorClass } from '../../hooks/usePeerColor';

import BadgeButton from './BadgeButton';

type OwnProps = {
  chatId: string;
  userId: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  className?: string;
  rank?: string;
  isClickable?: boolean;
};

const OWNER_PEER_COLOR = 2;
const ADMIN_PEER_COLOR = 3;

const RankBadge = (props: OwnProps) => {
  const { openRankModal } = getActions();
  const lang = useLang();
  const hasCustomColor = createMemo(() => props.isOwner || props.isAdmin);
  const isPlain = createMemo(() => !hasCustomColor());

  const rankText = createMemo(
    () => props.rank || (props.isOwner && lang('ChannelCreator')) || (props.isAdmin && lang('ChannelAdmin')),
  );

  const handleClick = () => {
    if (!props.chatId) return;
    openRankModal({
      chatId: props.chatId,
      userId: props.userId,
      isAdmin: props.isAdmin,
      isOwner: props.isOwner,
      rank: props.rank,
    });
  };

  return (
    <Show when={rankText()}>
      <BadgeButton
        className={buildClassName(
          hasCustomColor() && getPeerColorClass(props.isOwner ? OWNER_PEER_COLOR : ADMIN_PEER_COLOR),
          isPlain() && 'admin-title-plain',
          props.className,
        )}
        isPlain={isPlain()}
        inline
        onClick={props.isClickable ? handleClick : undefined}
      >
        {rankText()}
      </BadgeButton>
    </Show>
  );
};

export default RankBadge;
