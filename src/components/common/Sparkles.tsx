import { Show, splitProps } from 'frameact/dom';
import { createShowTransition } from '../../lib/kit';

import type { GlobalState } from '../../global/types';

import { selectTabState } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';

import useSelector from '../../hooks/data/useSelector';

import styles from './Sparkles.module.scss';

function selectIsHeavyModalOpen(global: GlobalState) {
  const tabState = selectTabState(global);
  return Boolean(tabState.giftCraftModal || tabState.giftCraftSelectModal);
}

type ButtonParameters = {
  preset: 'button';
};

type ProgressParameters = {
  preset: 'progress';
};

type PresetParameters = ButtonParameters | ProgressParameters;

type OwnProps = {
  className?: string;
  style?: string;
  noAnimation?: boolean;
} & PresetParameters;

const SYMBOL = '✦';
const ANIMATION_DURATION = 5;

// Values are in percents
const BUTTON_POSITIONS = [
  {
    x: 20,
    y: 0,
    size: 100,
    durationShift: 10,
  },
  {
    x: 15,
    y: 15,
    size: 75,
    durationShift: 70,
  },
  {
    x: 10,
    y: 35,
    size: 75,
    durationShift: 90,
  },
  {
    x: 20,
    y: 70,
    size: 125,
    durationShift: 30,
  },
  {
    x: 40,
    y: 10,
    size: 125,
    durationShift: 0,
  },
  {
    x: 45,
    y: 60,
    size: 75,
    durationShift: 60,
  },
  {
    x: 60,
    y: -10,
    size: 100,
    durationShift: 20,
  },
  {
    x: 55,
    y: 40,
    size: 75,
    durationShift: 60,
  },
  {
    x: 70,
    y: 65,
    size: 100,
    durationShift: 90,
  },
  {
    x: 80,
    y: 10,
    size: 75,
    durationShift: 30,
  },
  {
    x: 80,
    y: 45,
    size: 125,
    durationShift: 0,
  },
];
const PROGRESS_POSITIONS = generateRandomProgressPositions(100);

const Sparkles = (props: OwnProps) => {
  const [, presetSettings] = splitProps(props, ['className', 'style', 'noAnimation']);
  const isHeavyModalOpen = useSelector(selectIsHeavyModalOpen);

  const { ref, shouldRender } = createShowTransition({
    isOpen: () => !isHeavyModalOpen(),
    noMountTransition: true,
  });

  return (
    <Show when={shouldRender()}>
      <Show
        when={!(presetSettings.preset === 'button')}
        fallback={
          <div
            ref={ref}
            class={buildClassName(styles.root, styles.button, props.className, props.noAnimation && styles.noAnimation)}
            style={props.style}
          >
            {BUTTON_POSITIONS.map((position) => {
              const shiftX = Math.cos(Math.atan2(-50 + position.y, -50 + position.x)) * 100;
              const shiftY = Math.sin(Math.atan2(-50 + position.y, -50 + position.x)) * 100;
              return (
                <div
                  class={styles.symbol}
                  style={buildStyle(
                    `top: ${position.y}%`,
                    `left: ${position.x}%`,
                    `--_duration-shift: ${(-position.durationShift / 100) * ANIMATION_DURATION}s`,
                    `--_shift-x: ${shiftX}%`,
                    `--_shift-y: ${shiftY}%`,
                    `scale: ${position.size}%`,
                  )}
                  aria-hidden="true"
                >
                  {SYMBOL}
                </div>
              );
            })}
          </div>
        }
      >
        <Show
          when={!(presetSettings.preset === 'progress')}
          fallback={
            <div ref={ref} class={buildClassName(styles.root, styles.progress, props.className)} style={props.style}>
              {PROGRESS_POSITIONS.map((position) => {
                return (
                  <div
                    class={styles.symbol}
                    style={buildStyle(
                      `top: ${position.y}%`,
                      `left: ${position.x}%`,
                      `--_shift-x: ${position.velocityX}%`,
                      `--_shift-y: ${position.velocityY}%`,
                      `scale: ${position.scale}%`,
                      `--_duration-shift: ${(-position.durationShift / 100) * ANIMATION_DURATION}s`,
                    )}
                    aria-hidden="true"
                  >
                    {SYMBOL}
                  </div>
                );
              })}
            </div>
          }
        >
          {undefined}
        </Show>
      </Show>
    </Show>
  );
};

function generateRandomProgressPositions(count: number) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    positions.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      velocityX: (Math.random() * 5 + 15) * 100,
      velocityY: (Math.random() * 10 - 5) * 100,
      scale: (Math.random() * 0.5 + 0.5) * 100,
      durationShift: Math.random() * 100,
    });
  }
  return positions;
}

export default Sparkles;
