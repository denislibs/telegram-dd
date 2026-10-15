import { createEffect, createMemo, createSignal } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import { createShowTransition } from '../../../lib/kit';
import type { GlobalState } from '../../../global/types';

import type { ApiReaction, ApiReactionPaid } from '../../../api/types';

import { isSameReaction } from '../../../global/helpers';
import { selectPerformanceSettingsValue, selectTabState } from '../../../global/selectors';
import { IS_ANDROID, IS_IOS } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { LOCAL_TGS_URLS } from '../helpers/animatedAssets';
import { REM } from '../helpers/mediaDimensions';

import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';

import AnimatedIcon from '../AnimatedIcon';
import StarIcon from '../icons/StarIcon';

import styles from './ReactionAnimatedEmoji.module.scss';

type OwnProps = {
  containerId: string;
  reaction: ApiReactionPaid;
  className?: string;
  size?: number;
  effectSize?: number;
  localAmount?: number;
  observeIntersection?: ObserveFn;
};

type StateProps = {
  activeReactions?: ApiReaction[];
  withEffects?: boolean;
};

const ICON_SIZE = 1.5 * REM;
const EFFECT_SIZE = 6.5 * REM;
const MAX_EFFECT_COUNT = IS_IOS || IS_ANDROID ? 2 : 5;
const QUALITY = IS_IOS || IS_ANDROID ? 2 : 3;

const PaidReactionEmoji = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { stopActiveReaction } = getActions();

  let ref!: HTMLDivElement;
  let effectRef!: HTMLDivElement;

  const [effectsIds, setEffectsIds] = createSignal<number[]>([]);

  const isIntersecting = useIsIntersecting(() => ref, () => props.observeIntersection);

  const activeReaction = createMemo(
    () => props.activeReactions?.find((active) => isSameReaction(active, props.reaction)),
  );

  const shouldPlayEffect = createMemo(() => Boolean(props.withEffects && activeReaction()));
  const canAddMoreEffects = createMemo(() => effectsIds().length < MAX_EFFECT_COUNT);

  createEffect(
    depsOf(() => [props.localAmount, canAddMoreEffects(), shouldPlayEffect()]), (_deps, prev) => {
      const [prevLocalAmount] = prev ?? [];
      if (!shouldPlayEffect()) {
        setEffectsIds([]);
        return;
      }

      if (!props.localAmount || props.localAmount <= (prevLocalAmount || 0)) {
        return;
      }

      if (canAddMoreEffects()) {
        setEffectsIds((prev) => [...prev, Date.now()]);
      }
    },
  );

  const { shouldRender: shouldRenderEffect } = createShowTransition({
    // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
    ref: () => effectRef,
    noMountTransition: true,
    isOpen: () => shouldPlayEffect(),
    className: 'slow',
  });

  const handleEnded = () => {
    const newEffectsIds = effectsIds().slice(1);
    setEffectsIds(newEffectsIds);
    if (!newEffectsIds.length) {
      stopActiveReaction({ containerId: props.containerId, reaction: props.reaction });
    }
  };

  const rootClassName = createMemo(() => buildClassName(styles.root, shouldRenderEffect() && styles.animating, props.className));

  return (
    // TODO(codemod): teactFastList without a single .map() child: use <For> / <ManualFor> for the rows
    <div class={rootClassName()} ref={ref}>
      <StarIcon type="gold" size="adaptive" style={`width: ${(props.size === undefined ? ICON_SIZE : props.size)}px; height: ${(props.size === undefined ? ICON_SIZE : props.size)}px`} />
      {shouldRenderEffect() &&
        effectsIds().map((id) => (
          <AnimatedIcon
            ref={effectRef}
            className={styles.effect}
            size={(props.effectSize === undefined ? EFFECT_SIZE : props.effectSize)}
            tgsUrl={LOCAL_TGS_URLS.StarReactionEffect}
            play={isIntersecting}
            noLoop
            forceAlways
            nonInteractive
            quality={QUALITY}
            onEnded={handleEnded}
          />
        ))}
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { containerId }: OwnProps) => {
    const { activeReactions } = selectTabState(global);

    const withEffects = selectPerformanceSettingsValue(global, 'reactionEffects');

    return {
      activeReactions: activeReactions?.[containerId],
      withEffects,
    };
  };

export default PaidReactionEmoji;
