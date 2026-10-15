import { createEffect, createMeasureEffect, createMemo, createSignal, requestMeasure, requestMutation } from 'frameact';
import { For, Show, toggleExtraClass } from 'frameact/dom';

import type { ApiEmojiGroup } from '../../../api/types';

import animateHorizontalScroll from '../../../util/animateHorizontalScroll';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { depsOf } from '../../../util/effectDeps';

import useFlag from '../../../hooks/useFlag';
import useHorizontalScroll from '../../../hooks/useHorizontalScroll';
import useLang from '../../../hooks/useLang';

import CustomEmoji from '../../common/CustomEmoji';
import Icon from '../../common/icons/Icon';
import Button from '../../ui/Button';
import Spinner from '../../ui/Spinner';

import styles from './EmojiSearch.module.scss';

type OwnProps = {
  value: string;
  groups?: ApiEmojiGroup[];
  activeGroup?: ApiEmojiGroup;
  placeholder?: string;
  isLoading?: boolean;
  hasBackButton?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onGroupSelect: (group?: ApiEmojiGroup) => void;
  onBackClick?: NoneToVoidFunction;
  onFocus?: NoneToVoidFunction;
  onBlur?: NoneToVoidFunction;
};

const CHIP_ICON_SIZE = 26;

const EmojiSearch = (props: OwnProps) => {
  let inputRef!: HTMLInputElement;
  // Deviation: the chips container is rendered conditionally and `useHorizontalScroll` reads its ref in the first compute,
  // so the element is a signal. It is written from a measure task: the container can be created in the mutate phase.
  const [chipsRef, setChipsRef] = createSignal<HTMLDivElement | undefined>(undefined);

  const lang = useLang();

  const [isFocused, markFocused, unmarkFocused] = useFlag();

  const placeholderText = createMemo(() => props.placeholder || lang('SearchEmoji'));
  const hasText = createMemo(() => Boolean(props.value.trim()));
  const hasChips = createMemo(() => Boolean(props.groups?.length));
  const isActive = createMemo(() => Boolean(props.value || props.activeGroup || isFocused()));

  useHorizontalScroll(chipsRef, () => !hasChips(), true);

  createEffect(
    depsOf(() => [isActive(), props.onChange, props.onGroupSelect] as const),
    ([isActive2, onChange2, onGroupSelect2]) => {
      if (!isActive2) {
        return undefined;
      }

      return captureEscKeyListener(() => {
        onGroupSelect2(undefined);
        onChange2('');
        requestMutation(() => inputRef?.blur());
      });
    },
  );

  createMeasureEffect(
    () => props.activeGroup,
    (activeGroup2) => {
      requestMeasure(() => {
        const chips = chipsRef();
        if (!chips) {
          return;
        }

        if (!activeGroup2) {
          animateHorizontalScroll(chips, 0);
          return;
        }

        const activeChip = chips.querySelector<HTMLElement>(`.${styles.chipActive}`);
        if (!activeChip) {
          return;
        }

        const newLeft = activeChip.offsetLeft - chips.offsetWidth / 2 + activeChip.offsetWidth / 2;
        animateHorizontalScroll(chips, newLeft);
      });
    },
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    props.onChange(e.currentTarget.value);
  };

  const handleFocus = () => {
    markFocused();
    props.onFocus?.();
  };

  const handleBlur = () => {
    unmarkFocused();
    props.onBlur?.();
  };

  const handleBackClick = () => {
    if (props.hasBackButton) {
      props.onBackClick?.();
      return;
    }

    props.onGroupSelect(undefined);
  };

  const handleClearClick = () => {
    props.onChange('');
    requestMutation(() => inputRef?.blur());
  };

  const handleChipClick = (group: ApiEmojiGroup) => {
    props.onGroupSelect(group === props.activeGroup ? undefined : group);
  };

  const handleChipKeyDown = (e: React.KeyboardEvent, group: ApiEmojiGroup) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleChipClick(group);
    }
  };

  const handleSurfaceClick = () => {
    requestMutation(() => inputRef?.focus());
  };

  const handleChipsScroll = (e: Event) => {
    const chips = e.currentTarget as HTMLDivElement;
    const shouldMaskStart = Math.abs(chips.scrollLeft) > 1;
    requestMutation(() => {
      toggleExtraClass(chips, styles.chipsMaskStart, shouldMaskStart);
    });
  };

  return (
    <div class={buildClassName(styles.root, props.className)}>
      <div class={styles.iconContainer}>
        <Icon
          name="search"
          className={buildClassName(
            styles.leadingIcon,
            (props.activeGroup || props.isLoading || props.hasBackButton) && styles.iconHidden,
          )}
        />
        <Spinner
          className={buildClassName(
            styles.spinner,
            (!props.isLoading || props.activeGroup || props.hasBackButton) && styles.iconHidden,
          )}
          color="gray"
        />
        <Icon
          name="arrow-left"
          className={buildClassName(
            styles.leadingIcon,
            styles.backIcon,
            !props.activeGroup && !props.hasBackButton && styles.iconHidden,
          )}
          role="button"
          ariaLabel={lang('AccDescrGoBack')}
          onClick={handleBackClick}
        />
      </div>
      <input
        ref={inputRef}
        type="text"
        dir="auto"
        class={styles.input}
        placeholder={hasChips() ? undefined : placeholderText()}
        aria-label={placeholderText()}
        use:value={() => props.value}
        onInput={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      <Button
        round
        size="tiny"
        color="translucent"
        className={buildClassName(styles.clearButton, !props.value && styles.iconHidden)}
        iconName="close"
        ariaLabel={lang('Clear')}
        tabIndex={props.value ? undefined : -1}
        onClick={handleClearClick}
      />
      <Show when={hasChips()}>
        <div
          ref={(el) => requestMeasure(() => setChipsRef(el))}
          class={buildClassName(
            styles.chips,
            'no-scrollbar',
            lang.isRtl && styles.chipsRtl,
            hasText() && styles.chipsHidden,
          )}
          onScroll={handleChipsScroll}
        >
          <div class={styles.inputSurface} onClick={handleSurfaceClick}>
            {!hasText() && placeholderText()}
          </div>
          <For each={props.groups} keyed={(group) => group.title}>
            {(group) => (
              <div
                role="button"
                tabIndex={0}
                aria-label={group().title}
                class={buildClassName(styles.chip, group() === props.activeGroup && styles.chipActive)}
                onClick={() => handleChipClick(group())}
                onKeyDown={(e) => handleChipKeyDown(e, group())}
              >
                <CustomEmoji
                  documentId={group().iconEmojiId}
                  size={CHIP_ICON_SIZE}
                  isBig
                  shouldNotLoop
                  forceTextColor
                />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default EmojiSearch;
