import { createEffect, createMemo, createSignal } from 'frameact';
import { For } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';

import type { ApiReactionPaid, ApiReactionWithPaid } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { createShowTransition } from '../../../lib/kit';
import { isSameReaction } from '../../../global/helpers';
import { selectPerformanceSettingsValue, selectTabState } from '../../../global/selectors';
import { IS_ANDROID, IS_IOS } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';
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
  activeReactions?: ApiReactionWithPaid[];
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

  const [effectsIds, setEffectsIds] = createSignal<number[]>([]);

  const isIntersecting = useIsIntersecting(
    () => ref,
    () => props.observeIntersection,
  );

  const activeReaction = createMemo(() =>
    props.activeReactions?.find((active) => isSameReaction(active, props.reaction)),
  );

  const shouldPlayEffect = createMemo(() => Boolean(props.withEffects && activeReaction()));
  const canAddMoreEffects = createMemo(() => effectsIds().length < MAX_EFFECT_COUNT);

  createEffect(
    depsOf(() => [props.localAmount, canAddMoreEffects(), shouldPlayEffect()] as const),
    ([localAmount, canAddMore, shouldPlay], prev) => {
      const [prevLocalAmount] = prev ?? [];
      if (!shouldPlay) {
        setEffectsIds([]);
        return;
      }

      if (!localAmount || localAmount <= (prevLocalAmount || 0)) {
        return;
      }

      if (canAddMore) {
        setEffectsIds((prevIds) => [...prevIds, Date.now()]);
      }
    },
  );

  // Deviation: `useShowTransition({ ref })` -> the transition's `ref` is handed to every effect icon (the last one wins, as in tt).
  const { shouldRender: shouldRenderEffect, ref: effectRef } = createShowTransition({
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

  const rootClassName = createMemo(() =>
    buildClassName(styles.root, shouldRenderEffect() && styles.animating, props.className),
  );

  return (
    <div class={rootClassName()} ref={ref}>
      <StarIcon
        type="gold"
        size="adaptive"
        style={`width: ${props.size === undefined ? ICON_SIZE : props.size}px; height: ${props.size === undefined ? ICON_SIZE : props.size}px`}
      />
      {shouldRenderEffect() && (
        <For each={effectsIds()}>
          {() => (
            <AnimatedIcon
              ref={effectRef}
              className={styles.effect}
              size={props.effectSize === undefined ? EFFECT_SIZE : props.effectSize}
              tgsUrl={LOCAL_TGS_URLS.StarReactionEffect}
              play={isIntersecting()}
              noLoop
              forceAlways
              nonInteractive
              quality={QUALITY}
              onEnded={handleEnded}
            />
          )}
        </For>
      )}
    </div>
  );
};

const mapStateToProps = (global: GlobalState, { containerId }: OwnProps): Complete<StateProps> => {
  const { activeReactions } = selectTabState(global);

  const withEffects = selectPerformanceSettingsValue(global, 'reactionEffects');

  return {
    activeReactions: activeReactions?.[containerId],
    withEffects,
  };
};

export default PaidReactionEmoji;
