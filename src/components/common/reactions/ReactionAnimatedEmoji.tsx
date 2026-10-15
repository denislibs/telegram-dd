import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';

import type {
  ApiAvailableReaction,
  ApiReaction,
  ApiReactionCustomEmoji,
  ApiReactionWithPaid,
  ApiStickerSet,
} from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { createShowTransition } from '../../../lib/kit';
import { getStickerHashById, isSameReaction } from '../../../global/helpers';
import { selectPerformanceSettingsValue, selectTabState } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { roundToNearestEven } from '../../../util/math';
import { REM } from '../helpers/mediaDimensions';

import useFlag from '../../../hooks/useFlag';
import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useMedia from '../../../hooks/useMedia';
import useCustomEmoji from '../hooks/useCustomEmoji';

import AnimatedSticker from '../AnimatedSticker';
import CustomEmoji from '../CustomEmoji';
import CustomEmojiEffect from './CustomEmojiEffect';
import ReactionStaticEmoji from './ReactionStaticEmoji';

import styles from './ReactionAnimatedEmoji.module.scss';

type OwnProps = {
  containerId: string;
  reaction: ApiReaction;
  className?: string;
  size?: number;
  effectSize?: number;
  withEffectOnly?: boolean;
  shouldPause?: boolean;
  shouldLoop?: boolean;
  loopLimit?: number;
  observeIntersection?: ObserveFn;
};

type StateProps = {
  activeReactions?: ApiReactionWithPaid[];
  availableReactions?: ApiAvailableReaction[];
  genericEffects?: ApiStickerSet;
  withEffects?: boolean;
};

const ICON_SIZE = 1.5 * REM;
const CENTER_ICON_MULTIPLIER = 1.9;
const EFFECT_SIZE = 6.5 * REM;
const CUSTOM_EMOJI_EFFECT_MULTIPLIER = 0.5;
const MIN_PARTICLE_SIZE = REM;

const ReactionAnimatedEmoji = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { stopActiveReaction } = getActions();

  let ref!: HTMLDivElement;

  // tt: destructuring defaults `size = ICON_SIZE`, `effectSize = EFFECT_SIZE`
  const size = createMemo(() => (props.size === undefined ? ICON_SIZE : props.size));
  const effectSize = createMemo(() => (props.effectSize === undefined ? EFFECT_SIZE : props.effectSize));

  const isCustom = createMemo(() => props.reaction.type === 'custom');
  const customDocumentId = createMemo(() => (props.reaction.type === 'custom' ? props.reaction.documentId : undefined));

  const availableReaction = createMemo(() =>
    props.availableReactions?.find((r) => isSameReaction(r.reaction, props.reaction)),
  );
  const centerIconId = createMemo(() => availableReaction()?.centerIcon?.id);

  const { customEmoji } = useCustomEmoji(customDocumentId);

  const assignedEffectId = createMemo(() => {
    if (!isCustom()) return availableReaction()?.aroundAnimation?.id;

    const emoji = customEmoji();
    if (!emoji) return undefined;
    const assignedId = props.availableReactions?.find((available) => available.reaction.emoticon === emoji.emoji)
      ?.aroundAnimation?.id;
    return assignedId;
  });

  const effectId = createMemo(() => {
    if (assignedEffectId()) {
      return assignedEffectId();
    }

    if (!props.genericEffects?.stickers) {
      return undefined;
    }

    const { stickers } = props.genericEffects;
    const randomIndex = Math.floor(Math.random() * stickers.length);

    return stickers[randomIndex].id;
  });

  const isIntersecting = useIsIntersecting(
    () => ref,
    () => props.observeIntersection,
  );

  const mediaHashCenterIcon = createMemo(() => centerIconId() && getStickerHashById(centerIconId()!));
  const mediaHashEffect = createMemo(() => effectId() && getStickerHashById(effectId()!));

  const mediaDataCenterIcon = useMedia(mediaHashCenterIcon);
  const mediaDataEffect = useMedia(mediaHashEffect);

  const activeReaction = createMemo(() =>
    props.activeReactions?.find((active) => isSameReaction(active, props.reaction)),
  );

  const shouldPlayEffect = createMemo(() =>
    Boolean(props.withEffects && activeReaction() && (isCustom() || mediaDataCenterIcon()) && mediaDataEffect()),
  );
  const shouldPlayCenter = createMemo(
    () => isIntersecting() && ((shouldPlayEffect() && !props.withEffectOnly) || props.shouldLoop),
  );
  // Deviation: `useShowTransitionDeprecated` -> `createShowTransition`; the state classes are written through `ref`
  // (tt handed the class names down). The particles of `CustomEmojiEffect` share the effect's classes, so they get a
  // transition of their own.
  const { shouldRender: shouldRenderEffect, ref: effectRef } = createShowTransition({
    isOpen: () => shouldPlayEffect(),
    noMountTransition: true,
    className: 'slow',
  });
  const { ref: particlesRef } = createShowTransition({
    isOpen: () => shouldPlayEffect(),
    noMountTransition: true,
    className: 'slow',
  });
  const { shouldRender: shouldRenderCenter, ref: centerRef } = createShowTransition({
    isOpen: () => shouldPlayCenter(),
    noMountTransition: true,
    className: 'slow',
  });

  const handleEnded = () => {
    stopActiveReaction({ containerId: props.containerId, reaction: props.reaction });
  };

  const [isAnimationLoaded, markAnimationLoaded, unmarkAnimationLoaded] = useFlag();
  const shouldShowStatic = createMemo(() => !isCustom() && (!shouldPlayCenter() || !isAnimationLoaded()));
  const { shouldRender: shouldRenderStatic, ref: staticRef } = createShowTransition({
    isOpen: () => shouldShowStatic(),
    noMountTransition: true,
  });

  const rootClassName = createMemo(() =>
    buildClassName(
      styles.root,
      shouldRenderEffect() && styles.animating,
      props.withEffectOnly && styles.withEffectOnly,
      props.className,
    ),
  );

  return (
    <div class={rootClassName()} ref={ref}>
      {!props.withEffectOnly && shouldRenderStatic() && (
        <ReactionStaticEmoji
          ref={staticRef}
          reaction={props.reaction}
          availableReactions={props.availableReactions}
          size={size()}
          observeIntersection={props.observeIntersection}
        />
      )}
      {!props.withEffectOnly && isCustom() && (
        <CustomEmoji
          documentId={customDocumentId()!}
          className={styles.customEmoji}
          size={size()}
          noPlay={props.shouldPause}
          noVideoOnMobile
          loopLimit={props.loopLimit}
          observeIntersectionForPlaying={props.observeIntersection}
          forceAlways
        />
      )}
      <Show when={shouldRenderCenter() && !isCustom()}>
        {/* tt: key={`${centerIconId}-${size}`} */}
        <Show when={`${centerIconId()}-${size()}`} keyed>
          {(_key) => (
            <AnimatedSticker
              ref={centerRef}
              className={styles.animatedIcon}
              size={roundToNearestEven(size() * CENTER_ICON_MULTIPLIER)}
              tgsUrl={mediaDataCenterIcon()}
              play={isIntersecting() && !props.shouldPause}
              noLoop={!props.shouldLoop}
              onLoad={markAnimationLoaded}
              onEnded={unmarkAnimationLoaded}
              forceAlways
            />
          )}
        </Show>
      </Show>
      {shouldRenderEffect() && (
        <>
          {/* tt: key={`${effectId}-${effectSize}`} */}
          <Show when={`${effectId()}-${effectSize()}`} keyed>
            {(_key) => (
              <AnimatedSticker
                ref={effectRef}
                className={styles.effect}
                size={effectSize()}
                tgsUrl={mediaDataEffect()}
                play={isIntersecting()}
                noLoop
                onEnded={handleEnded}
                forceAlways
              />
            )}
          </Show>
          {isCustom() && !assignedEffectId() && isIntersecting() && (
            <CustomEmojiEffect
              ref={particlesRef}
              reaction={props.reaction as ApiReactionCustomEmoji}
              particleSize={Math.max(size() * CUSTOM_EMOJI_EFFECT_MULTIPLIER, MIN_PARTICLE_SIZE)}
              onEnded={handleEnded}
            />
          )}
        </>
      )}
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { containerId }: OwnProps): Complete<StateProps> => {
  const { genericEmojiEffects, reactions } = global;
  const { activeReactions } = selectTabState(global);

  const withEffects = selectPerformanceSettingsValue(global, 'reactionEffects');

  return {
    activeReactions: activeReactions?.[containerId],
    availableReactions: reactions.availableReactions,
    genericEffects: genericEmojiEffects,
    withEffects,
  };
};

export default ReactionAnimatedEmoji;
