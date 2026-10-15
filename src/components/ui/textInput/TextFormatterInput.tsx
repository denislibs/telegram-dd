import { createEffect, createMemo, createMutationEffect, requestForcedReflow } from 'frameact';
import { Show } from 'frameact/dom';

import type { IconName } from '../../../types/icons';

import { IS_TAURI } from '../../../util/browser/globalEnvironment';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { depsOf } from '../../../util/effectDeps';

import useLang from '../../../hooks/useLang';
import useScrollableHint from '../../../hooks/useScrollableHint';

import Button from '../Button';

import styles from './TextFormatter.module.scss';

type OwnProps = {
  value: string;
  placeholder: string;
  ariaLabel: string;
  isActive?: boolean;
  leadingButtonIconName?: IconName;
  leadingButtonAriaLabel?: string;
  canSubmitEmpty?: boolean;
  shouldSpellCheck?: boolean;
  inputMode?: 'text' | 'url';
  dir?: 'auto' | 'ltr' | 'rtl';
  onChange: (value: string) => void;
  onSubmit: NoneToVoidFunction;
  onEscape?: NoneToVoidFunction;
  onDeleteEmpty?: NoneToVoidFunction;
  onLeadingButtonClick?: NoneToVoidFunction;
};

const TextFormatterInput = (props: OwnProps) => {
  let inputRef: HTMLInputElement | undefined;
  const lang = useLang();
  const { updateScrollableHint } = useScrollableHint(() => inputRef, {
    isDisabled: () => !props.isActive,
    shouldSkipOverflowCheck: true,
  });

  const canSubmit = createMemo(() => props.canSubmitEmpty || Boolean(props.value.trim().length));

  // tt focused from a mutation task booked after the render that removed `inert` from the link control. Here that
  // removal is a binding of the parent in the mutate phase, so a measure-phase `focus()` hit an inert ancestor and was
  // ignored (the typed URL replaced the selected text).
  // Deviation: `focus()` is a layout read, so it runs in the forced-reflow measure that follows this frame's mutate phase
  // (after every binding applied), and the selection in the forced-reflow mutate after it.
  createMutationEffect(
    () => props.isActive,
    (isActive2) => {
      if (!isActive2) {
        return;
      }

      requestForcedReflow(() => {
        const input = inputRef;
        if (!input || !props.isActive) return undefined;

        input.focus();
        return () => {
          input.setSelectionRange(input.value.length, input.value.length);
        };
      });
    },
  );

  createEffect(
    depsOf(() => [props.isActive, props.onEscape] as const),
    ([isActive2, onEscape2]) => (isActive2 && onEscape2 ? captureEscKeyListener(onEscape2) : undefined),
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    props.onChange(e.currentTarget.value);
    updateScrollableHint(e.currentTarget);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!props.value && props.onDeleteEmpty && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      e.stopPropagation();
      props.onDeleteEmpty();
      return;
    }

    if (e.key !== 'Enter' || !canSubmit()) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    props.onSubmit();
  }

  return (
    <div class={buildClassName(styles.buttons, styles.inputControl)} data-text-formatter>
      <Show when={props.leadingButtonIconName && props.leadingButtonAriaLabel && props.onLeadingButtonClick}>
        <Button
          color="translucent"
          ariaLabel={props.leadingButtonAriaLabel}
          onClick={() => props.onLeadingButtonClick?.()}
          iconName={props.leadingButtonIconName}
        />
        <div class={styles.divider} />
      </Show>
      <div class={styles.inputWrapper}>
        <input
          ref={(el) => {
            inputRef = el;
          }}
          class={buildClassName(styles.inputField, 'custom-scroll-x', 'no-scrollbar')}
          type="text"
          use:value={() => props.value}
          placeholder={props.placeholder}
          autocomplete="off"
          spellcheck={props.shouldSpellCheck === false || IS_TAURI ? 'false' : undefined}
          inputMode={props.inputMode}
          dir={props.dir}
          aria-label={props.ariaLabel}
          onInput={handleChange}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
      <div class={styles.inputConfirm}>
        <div class={styles.divider} />
        <Button
          color="translucent"
          ariaLabel={lang('Save')}
          className="color-primary"
          disabled={!canSubmit()}
          onClick={props.onSubmit}
          iconName="check"
        />
      </div>
    </div>
  );
};

export default TextFormatterInput;
