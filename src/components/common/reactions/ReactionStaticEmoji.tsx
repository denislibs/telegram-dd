import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { createMediaTransition } from '../../../lib/kit';

import type { ApiAvailableReaction, ApiReaction } from '../../../api/types';

import { isSameReaction } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';

import useThumbnail from '../../../hooks/media/useThumbnail';
import useMedia from '../../../hooks/useMedia';

import CustomEmoji from '../CustomEmoji';
import Icon from '../icons/Icon';

import './ReactionStaticEmoji.scss';

import blankUrl from '../../../assets/blank.png';

type OwnProps = {
  reaction: ApiReaction;
  availableReactions?: ApiAvailableReaction[];
  className?: string;
  size?: number;
  withIconHeart?: boolean;
  observeIntersection?: ObserveFn;
};

const ReactionStaticEmoji = (props: OwnProps) => {
  const availableReaction = createMemo(
    () => props.availableReactions?.find((available) => isSameReaction(available.reaction, props.reaction)),
  );
  const staticIcon = createMemo(() => availableReaction()?.staticIcon);
  const staticIconId = createMemo(() => staticIcon()?.id);
  const mediaHash = createMemo(() => staticIconId() ? `document${staticIconId()}` : undefined);
  const cacheBuster = createMemo(() => availableReaction()?.isLocalCache ? 0 : 1);
  const mediaData = useMedia(mediaHash(), false, undefined, undefined, cacheBuster());
  const thumbDataUri = useThumbnail(staticIcon()?.thumbnail);

  const { ref: thumbRef } = createMediaTransition({
    hasMediaData: () => Boolean(thumbDataUri && !mediaData),
  });
  const { ref: mediaRef } = createMediaTransition({
    hasMediaData: () => Boolean(mediaData),
  });

  const shouldApplySizeFix = createMemo(() => props.reaction.type === 'emoji' && props.reaction.emoticon === '🦄');
  const shouldReplaceWithHeartIcon = createMemo(() => props.withIconHeart && props.reaction.type === 'emoji' && props.reaction.emoticon === '❤');

  return (
    <Show when={!(props.reaction.type === 'custom')} fallback={(
      <CustomEmoji
        documentId={props.reaction.documentId}
        className={buildClassName('ReactionStaticEmoji', props.className)}
        size={props.size}
        observeIntersectionForPlaying={props.observeIntersection}
      />
    )}>
    <Show when={!shouldReplaceWithHeartIcon()} fallback={<Icon name="heart" className="ReactionStaticEmoji" style={`font-size: ${props.size}px; width: ${props.size}px`} />}>
    <div
      class={buildClassName('ReactionStaticEmoji', props.className)}
      style={props.size ? `width: ${props.size}px; height: ${props.size}px` : undefined}
    >
      <img ref={thumbRef} class="thumb" src={thumbDataUri} alt="" draggable={false} />
      <img
        ref={mediaRef}
        class={buildClassName('media', shouldApplySizeFix() && 'with-unicorn-fix')}
        src={mediaData || blankUrl}
        alt={availableReaction()?.title}
        draggable={false}
      />
    </div>
    </Show>
    </Show>
  );
};

export default ReactionStaticEmoji;
