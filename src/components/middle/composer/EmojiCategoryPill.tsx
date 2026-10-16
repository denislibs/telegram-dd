import { createMeasureEffect, createSignal, onMount, requestMeasure } from 'frameact';
import { For } from 'frameact/dom';

import type { IconName } from '../../../types/icons';

import animateHorizontalScroll from '../../../util/animateHorizontalScroll';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';
import { REM } from '../../common/helpers/mediaDimensions';

import useHorizontalScroll from '../../../hooks/useHorizontalScroll';

import Button from '../../ui/Button';

import styles from './EmojiCategoryPill.module.scss';

export type PillCategory = {
  id: string;
  name: string;
  icon: IconName;
};

type OwnProps = {
  categories: PillCategory[];
  activeCategoryIndex?: number;
  isActive?: boolean;
  className?: string;
  onCategorySelect: (index: number) => void;
};

const BUTTON_WIDTH = 2.25 * REM;

const EmojiCategoryPill = (props: OwnProps) => {
  let stripEl!: HTMLDivElement;
  // Deviation: `useHorizontalScroll` reads its ref in the first compute, before the element exists, so the element is
  // handed over as a signal once it is attached (a write from the ref callback would dirty the hook's measure effect
  // from the mutate phase).
  const [stripRef, setStripRef] = createSignal<HTMLDivElement | undefined>(undefined);
  onMount(() => {
    setStripRef(stripEl);
  });

  useHorizontalScroll(stripRef, undefined, true, true);

  createMeasureEffect(
    depsOf(() => [props.isActive, props.activeCategoryIndex] as const),
    ([isActive2, activeCategoryIndex2]) => {
      requestMeasure(() => {
        const strip = stripRef();
        if (!strip) {
          return;
        }

        if (!isActive2) {
          animateHorizontalScroll(strip, 0);
          return;
        }

        if (activeCategoryIndex2 === undefined) {
          return;
        }

        const newLeft = activeCategoryIndex2 * BUTTON_WIDTH - strip.offsetWidth / 2 + BUTTON_WIDTH / 2;
        animateHorizontalScroll(strip, newLeft);
      });
    },
  );

  return (
    <div class={buildClassName(styles.root, props.className, props.isActive && styles.expanded)}>
      <div ref={stripEl} class={buildClassName(styles.strip, 'no-scrollbar')}>
        <For each={props.categories} keyed={(category) => category.id}>
          {(category, index) => (
            <Button
              className={buildClassName(
                'symbol-set-button',
                styles.categoryButton,
                index() === 0 && styles.firstCategory,
                props.isActive && index() === props.activeCategoryIndex && 'activated',
              )}
              round
              faded
              color="translucent"
              tabIndex={!props.isActive && index() !== 0 ? -1 : undefined}
              onClick={() => props.onCategorySelect(index())}
              ariaLabel={category().name}
              iconName={category().icon}
            />
          )}
        </For>
      </div>
    </div>
  );
};

export default EmojiCategoryPill;
