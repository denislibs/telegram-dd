import { beginHeavyAnimation, createEffect, createMemo } from 'frameact';
import { mergeProps, Show, splitProps } from 'frameact/dom';

import type { MenuPositionOptions } from '../../hooks/useMenuPosition';

import { createShowTransition } from '../../lib/kit';
import { IS_BACKDROP_BLUR_SUPPORTED } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import captureEscKeyListener from '../../util/captureEscKeyListener';
import { depsOf } from '../../util/effectDeps';
import { preventMessageInputBlurWithBubbling } from '../middle/helpers/preventMessageInputBlur';

import useAppLayout from '../../hooks/useAppLayout';
import useHistoryBack from '../../hooks/useHistoryBack';
import useKeyboardListNavigation from '../../hooks/useKeyboardListNavigation';
import useMenuPosition from '../../hooks/useMenuPosition';
import useVirtualBackdrop from '../../hooks/useVirtualBackdrop';

import Portal from './Portal';

import './Menu.scss';

export type { MenuPositionOptions } from '../../hooks/useMenuPosition';

type OwnProps = {
  ref?: (el: HTMLDivElement) => void;
  isOpen: boolean;
  shouldCloseFast?: boolean;
  id?: string;
  className?: string;
  bubbleClassName?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  autoClose?: boolean;
  footer?: string;
  noCloseOnBackdrop?: boolean;
  backdropExcludedSelector?: string;
  noCompact?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<any>) => void;
  onCloseAnimationEnd?: () => void;
  onClose: () => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  onMouseEnterBackdrop?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  withPortal?: boolean;
  nested?: boolean;
  children?: React.ReactNode;
} & MenuPositionOptions;

const ANIMATION_DURATION = 200;

const Menu = (rawProps: OwnProps) => {
  const props = mergeProps({ autoClose: false, noCloseOnBackdrop: false }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'autoClose' | 'noCloseOnBackdrop'>>;
  const [, positionOptions] = splitProps(props, [
    'ref',
    'shouldCloseFast',
    'isOpen',
    'id',
    'className',
    'bubbleClassName',
    'ariaLabel',
    'ariaLabelledBy',
    'children',
    'autoClose',
    'footer',
    'noCloseOnBackdrop',
    'backdropExcludedSelector',
    'noCompact',
    'onCloseAnimationEnd',
    'onClose',
    'onMouseEnter',
    'onMouseLeave',
    'withPortal',
    'onMouseEnterBackdrop',
    'nested',
  ]);
  const { isTouchScreen } = useAppLayout();

  let containerRef!: HTMLDivElement;

  let bubbleElement: HTMLDivElement | undefined;
  const getBubbleElement = () => bubbleElement;

  const { ref: bubbleTransitionRef } = createShowTransition({
    isOpen: () => props.isOpen,
    onCloseAnimationEnd: () => props.onCloseAnimationEnd?.(),
  });

  useMenuPosition(
    () => props.isOpen,
    () => containerRef,
    getBubbleElement,
    positionOptions,
  );

  createEffect(
    depsOf(() => [props.isOpen, props.onClose] as const),
    ([isOpen2, onClose2]) => (isOpen2 ? captureEscKeyListener(onClose2) : undefined),
  );

  useHistoryBack({
    isActive: () => props.isOpen,
    onBack: () => props.onClose(),
    shouldBeReplaced: true,
  });

  createEffect(
    depsOf(() => [props.isOpen]),
    ([isOpen2], prev) => {
      const [prevIsOpen] = prev ?? [];
      if (isOpen2 || (!isOpen2 && prevIsOpen === true)) {
        beginHeavyAnimation(ANIMATION_DURATION);
      }
    },
  );

  const navigateWithKeyboard = useKeyboardListNavigation(
    getBubbleElement,
    () => props.isOpen,
    undefined,
    '.MenuItem:not(.disabled), [role="menuitemradio"]:not(:disabled)',
    true,
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    navigateWithKeyboard(e);
    if (!props.autoClose || (e.key !== 'Enter' && e.key !== ' ')) {
      return;
    }

    const menuItem = e.target instanceof HTMLElement ? e.target.closest('.MenuItem') : undefined;
    if (menuItem && !menuItem.classList.contains('submenu')) {
      props.onClose();
    }
  };

  const fullExcludedSelector = createMemo(() =>
    props.backdropExcludedSelector ? `${props.backdropExcludedSelector}, .submenu` : '.submenu',
  );

  useVirtualBackdrop(
    () => props.isOpen,
    () => containerRef,
    () => (props.noCloseOnBackdrop ? undefined : props.onClose),
    undefined,
    () => fullExcludedSelector(),
  );

  const bubbleFullClassName = createMemo(() =>
    buildClassName(
      'bubble menu-container custom-scroll',
      props.footer && 'with-footer',
      props.bubbleClassName,
      props.shouldCloseFast && 'close-fast',
    ),
  );

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (props.autoClose) {
      props.onClose();
    }
  };

  const menu = (
    <div
      ref={containerRef}
      id={props.id}
      class={buildClassName(
        'Menu',
        !props.noCompact && !isTouchScreen() && 'compact',
        !IS_BACKDROP_BLUR_SUPPORTED && 'no-blur',
        props.withPortal && 'in-portal',
        props.className,
      )}
      aria-label={props.ariaLabel}
      aria-labelledby={props.ariaLabelledBy}
      role={props.ariaLabel || props.ariaLabelledBy ? 'menu' : undefined}
      // Deviation: handlers are bound once, so tt's render-time `isOpen ? handler : undefined` moves into the callbacks.
      onKeyDown={(e) => {
        if (props.isOpen) handleKeyDown(e);
      }}
      onMouseEnter={(e) => props.onMouseEnter?.(e)}
      onMouseLeave={(e) => {
        if (props.isOpen) props.onMouseLeave?.(e);
      }}
    >
      {props.isOpen && !props.nested && (
        // This only prevents click events triggering on underlying elements
        <div
          class="backdrop"
          onMouseDown={preventMessageInputBlurWithBubbling}
          onMouseEnter={(e) => props.onMouseEnterBackdrop?.(e)}
        />
      )}
      <div
        role="presentation"
        ref={(el) => {
          bubbleElement = el;
          bubbleTransitionRef(el);
          props.ref?.(el);
        }}
        class={bubbleFullClassName()}
        onClick={handleClick}
      >
        {props.children}
        {props.footer && <div class="footer">{props.footer}</div>}
      </div>
    </div>
  );

  return (
    <Show when={!props.withPortal} fallback={<Portal>{menu}</Portal>}>
      {menu}
    </Show>
  );
};

export default Menu;
