import { createMemo } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { createShowTransition } from '../../../lib/kit';
import type { GlobalState } from '../../../global/types';

import type { ApiAvailableReaction, ApiReaction, ApiStickerSet } from '../../../api/types';

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
  activeReactions?: ApiReaction[];
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

  const isCustom = createMemo(() => props.reaction.type === 'custom');

  const availableReaction = createMemo(
    () => props.availableReactions?.find((r) => isSameReaction(r.reaction, props.reaction)),
  );
  const centerIconId = createMemo(() => availableReaction()?.centerIcon?.id);

  const customEmojiResult = createMemo(() => useCustomEmoji(() => isCustom() ? props.reaction.documentId : undefined));
  const customEmoji = () => customEmojiResult().customEmoji;

  const assignedEffectId = createMemo(() => {
    if (!isCustom()) return availableReaction()?.aroundAnimation?.id;

    if (!customEmoji()) return undefined;
    const assignedId = props.availableReactions?.find((available) => available.reaction.emoticon === customEmoji().emoji)
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

  const isIntersecting = useIsIntersecting(() => ref, () => props.observeIntersection);

  const mediaHashCenterIcon = createMemo(() => centerIconId() && getStickerHashById(centerIconId()));
  const mediaHashEffect = createMemo(() => effectId() && getStickerHashById(effectId()));

  const mediaDataCenterIcon = useMedia(mediaHashCenterIcon());
  const mediaDataEffect = useMedia(mediaHashEffect());

  const activeReaction = createMemo(
    () => props.activeReactions?.find((active) => isSameReaction(active, props.reaction)),
  );

  const shouldPlayEffect = createMemo(() => Boolean(
    props.withEffects && activeReaction() && (isCustom() || mediaDataCenterIcon) && mediaDataEffect,
  ));
  const shouldPlayCenter = createMemo(() => isIntersecting && ((shouldPlayEffect() && !props.withEffectOnly) || props.shouldLoop));
  // TODO(codemod): useShowTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element (transitionClassNames/hasOpenClass are gone)
  const { shouldRender: shouldRenderEffect, transitionClassNames: animationClassNames } = createShowTransition({ isOpen: () => shouldPlayEffect(), noMountTransition: true, className: 'slow' });
  const { shouldRender: shouldRenderCenter, transitionClassNames: centerAnimationClassNames } =
    // TODO(codemod): useShowTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element (transitionClassNames/hasOpenClass are gone)
    createShowTransition({ isOpen: () => shouldPlayCenter(), noMountTransition: true, className: 'slow' });

  const handleEnded = () => {
    stopActiveReaction({ containerId: props.containerId, reaction: props.reaction });
  };

  const [isAnimationLoaded, markAnimationLoaded, unmarkAnimationLoaded] = useFlag();
  const shouldShowStatic = createMemo(() => !isCustom() && (!shouldPlayCenter() || !isAnimationLoaded()));
  // TODO(codemod): useShowTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element (transitionClassNames/hasOpenClass are gone)
  const { shouldRender: shouldRenderStatic, transitionClassNames: staticClassNames } = createShowTransition({ isOpen: () => shouldShowStatic(), noMountTransition: true });

  const rootClassName = createMemo(() => buildClassName(
    styles.root,
    shouldRenderEffect() && styles.animating,
    props.withEffectOnly && styles.withEffectOnly,
    props.className,
  ));

  return (
    <div class={rootClassName()} ref={ref}>
      {!props.withEffectOnly && shouldRenderStatic() && (
        <ReactionStaticEmoji
          className={staticClassNames}
          reaction={props.reaction}
          availableReactions={props.availableReactions}
          size={(props.size === undefined ? ICON_SIZE : props.size)}
          observeIntersection={props.observeIntersection}
        />
      )}
      {!props.withEffectOnly && isCustom() && (
        <CustomEmoji
          documentId={props.reaction.documentId}
          className={styles.customEmoji}
          size={(props.size === undefined ? ICON_SIZE : props.size)}
          noPlay={props.shouldPause}
          noVideoOnMobile
          loopLimit={props.loopLimit}
          observeIntersectionForPlaying={props.observeIntersection}
          forceAlways
        />
      )}
      {shouldRenderCenter() && !isCustom() && (
        // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show>
        <AnimatedSticker
          key={`${centerIconId()}-${(props.size === undefined ? ICON_SIZE : props.size)}`}
          className={buildClassName(styles.animatedIcon, centerAnimationClassNames)}
          size={roundToNearestEven((props.size === undefined ? ICON_SIZE : props.size) * CENTER_ICON_MULTIPLIER)}
          tgsUrl={mediaDataCenterIcon}
          play={isIntersecting && !props.shouldPause}
          noLoop={!props.shouldLoop}
          onLoad={markAnimationLoaded}
          onEnded={unmarkAnimationLoaded}
          forceAlways
        />
      )}
      {shouldRenderEffect() && (
        <>
          {/* TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show> */}
          <AnimatedSticker
            key={`${effectId()}-${(props.effectSize === undefined ? EFFECT_SIZE : props.effectSize)}`}
            className={buildClassName(styles.effect, animationClassNames)}
            size={(props.effectSize === undefined ? EFFECT_SIZE : props.effectSize)}
            tgsUrl={mediaDataEffect}
            play={isIntersecting}
            noLoop
            onEnded={handleEnded}
            forceAlways
          />
          {isCustom() && !assignedEffectId() && isIntersecting && (
            <CustomEmojiEffect
              reaction={props.reaction}
              className={animationClassNames}
              particleSize={Math.max((props.size === undefined ? ICON_SIZE : props.size) * CUSTOM_EMOJI_EFFECT_MULTIPLIER, MIN_PARTICLE_SIZE)}
              onEnded={handleEnded}
            />
          )}
        </>
      )}
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { containerId }: OwnProps) => {
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
