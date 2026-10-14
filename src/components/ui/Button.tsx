import type { MouseEvent as ReactMouseEvent } from 'react';
import { createMemo, createSignal } from 'frameact';
import { mergeProps, Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { IconName } from '../../types/icons';

import { IS_TOUCH_ENV, MouseButton } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';

import { useFileHoverOpenHandler } from '../../hooks/useFileHoverOpen';
import useOldLang from '../../hooks/useOldLang';

import Icon from '../common/icons/Icon';
import Sparkles from '../common/Sparkles';
import RippleEffect from './RippleEffect';
import Spinner from './Spinner';

import './Button.scss';

export type OwnProps = {
  ref?: (el: HTMLButtonElement | HTMLAnchorElement) => void;
  type?: 'button' | 'submit' | 'reset';
  children?: JSX.Element;
  size?: 'default' | 'smaller' | 'tiny';
  color?:
    | 'primary'
    | 'secondary'
    | 'gray'
    | 'danger'
    | 'translucent'
    | 'translucent-white'
    | 'translucent-black'
    | 'translucent-bordered'
    | 'translucent-primary'
    | 'dark'
    | 'green'
    | 'adaptive'
    | 'stars'
    | 'bluredStarsBadge'
    | 'transparentBlured';
  backgroundImage?: string;
  id?: string;
  className?: string;
  round?: boolean;
  pill?: boolean;
  badge?: boolean;
  fluid?: boolean;
  inline?: boolean;
  isText?: boolean;
  isLoading?: boolean;
  ariaLabel?: string;
  ariaControls?: string;
  ariaSelected?: boolean;
  hasPopup?: boolean;
  href?: string;
  download?: string;
  disabled?: boolean;
  nonInteractive?: boolean;
  allowDisabledClick?: boolean;
  noFastClick?: boolean;
  ripple?: boolean;
  faded?: boolean;
  tabIndex?: number;
  isRtl?: boolean;
  isShiny?: boolean;
  isRectangular?: boolean;
  withPremiumGradient?: boolean;
  withSparkleEffect?: boolean;
  noSparkleAnimation?: boolean;
  noPreventDefault?: boolean;
  noClickTransitionReset?: boolean;
  noForcedUpperCase?: boolean;
  shouldStopPropagation?: boolean;
  style?: string;
  autoFocus?: boolean;
  iconName?: IconName;
  iconAlignment?: 'top' | 'bottom' | 'start' | 'end';
  iconClassName?: string;
  iconHasPremiumBadge?: boolean;
  onClick?: (e: ReactMouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onContextMenu?: (e: ReactMouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onMouseDown?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  onMouseUp?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: NoneToVoidFunction;
  onFocus?: NoneToVoidFunction;
  onTransitionEnd?: NoneToVoidFunction;
  onFileHoverOpen?: NoneToVoidFunction;
};

// Longest animation duration;
const CLICKED_TIMEOUT = 400;

const Button = (rawProps: OwnProps) => {
  const props = mergeProps(
    {
      type: 'button',
      size: 'default',
      color: 'primary',
      get noFastClick() {
        return props.color === 'danger';
      },
      iconAlignment: 'start',
    },
    rawProps,
  ) as OwnProps & Required<Pick<OwnProps, 'type' | 'size' | 'color' | 'noFastClick' | 'iconAlignment'>>;
  const lang = useOldLang();

  const [isClicked, setIsClicked] = createSignal(false);
  const handleFileHoverOpen = useFileHoverOpenHandler(() => props.onFileHoverOpen?.());

  const isNotInteractive = createMemo(() => props.disabled || props.nonInteractive);

  const fullClassName = createMemo(() =>
    buildClassName(
      'Button',
      props.className,
      props.size,
      props.color,
      props.round && 'round',
      props.pill && 'pill',
      props.fluid && 'fluid',
      props.badge && 'badge',
      isNotInteractive() && 'disabled',
      props.nonInteractive && 'non-interactive',
      props.allowDisabledClick && 'click-allowed',
      props.isText && 'text',
      props.isLoading && 'loading',
      props.ripple && 'has-ripple',
      props.faded && 'faded',
      isClicked() && 'clicked',
      props.backgroundImage && 'with-image',
      props.isShiny && 'shiny',
      props.withPremiumGradient && 'premium',
      props.isRectangular && 'rectangular',
      props.noForcedUpperCase && 'no-upper-case',
      props.inline && 'inline',
      Boolean(props.iconName && props.children) && `content-with-icon-${props.iconAlignment}`,
    ),
  );

  const handleClick = (e: ReactMouseEvent<HTMLButtonElement, MouseEvent>) => {
    if ((props.allowDisabledClick || !isNotInteractive()) && props.onClick) {
      props.onClick(e);
    }

    if (props.shouldStopPropagation) e.stopPropagation();

    if (props.noClickTransitionReset) return;

    setIsClicked(true);
    setTimeout(() => {
      setIsClicked(false);
    }, CLICKED_TIMEOUT);
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (!props.noPreventDefault) e.preventDefault();

    if ((props.allowDisabledClick || !isNotInteractive()) && props.onMouseDown) {
      props.onMouseDown(e);
    }

    if (!IS_TOUCH_ENV && e.button === MouseButton.Main && !props.noFastClick) {
      handleClick(e);
    }
  };

  const renderIcon = () => {
    if (!props.iconName) return undefined;
    return <Icon name={props.iconName} className={props.iconClassName} hasPremiumBadge={props.iconHasPremiumBadge} />;
  };

  const renderContent = () => {
    if (props.isLoading) {
      return (
        <div class="loading-content">
          <span dir={props.isRtl ? 'auto' : undefined}>{lang('Cache.ClearProgress')}</span>
          <Spinner color={props.isText ? 'blue' : 'white'} />
        </div>
      );
    }

    const icon = renderIcon();

    if (!icon) {
      return props.children;
    }

    if (!props.children) {
      return icon;
    }

    return (
      <div class={`with-icon-${props.iconAlignment}`}>
        {icon}
        {props.children}
      </div>
    );
  };

  const content = (
    <>
      {props.withSparkleEffect && <Sparkles preset="button" noAnimation={props.noSparkleAnimation} />}
      {renderContent()}
      {!isNotInteractive() && props.ripple && <RippleEffect />}
    </>
  );

  return (
    <Show
      when={!props.href}
      fallback={
        <a
          ref={(el) => props.ref?.(el)}
          id={props.id}
          class={fullClassName()}
          href={props.href}
          title={props.ariaLabel}
          download={props.download}
          tabIndex={props.tabIndex}
          autofocus={props.autoFocus}
          dir={props.isRtl ? 'rtl' : undefined}
          aria-label={props.ariaLabel}
          aria-controls={props.ariaControls}
          style={props.style}
          onTransitionEnd={() => props.onTransitionEnd?.()}
          data-file-hover-open={props.onFileHoverOpen ? true : undefined}
          on:filehoveropen={handleFileHoverOpen}
          target="_blank"
          rel="noreferrer"
        >
          {content}
        </a>
      }
    >
      <button
        ref={(el) => props.ref?.(el)}
        id={props.id}
        type={props.type}
        class={fullClassName()}
        // Deviation: handlers are bound once, so tt's render-time conditions on the handlers below move into the callbacks.
        onClick={(e) => {
          if (IS_TOUCH_ENV || props.noFastClick) handleClick(e);
        }}
        onContextMenu={(e) => props.onContextMenu?.(e)}
        onMouseDown={handleMouseDown}
        onMouseUp={(e) => props.onMouseUp?.(e)}
        onMouseEnter={(e) => {
          if (!isNotInteractive()) props.onMouseEnter?.(e);
        }}
        onMouseLeave={() => {
          if (!isNotInteractive()) props.onMouseLeave?.();
        }}
        onTransitionEnd={() => props.onTransitionEnd?.()}
        onFocus={() => {
          if (!isNotInteractive()) props.onFocus?.();
        }}
        data-file-hover-open={props.onFileHoverOpen ? true : undefined}
        on:filehoveropen={handleFileHoverOpen}
        disabled={props.disabled && !props.allowDisabledClick}
        autofocus={props.autoFocus}
        aria-label={props.ariaLabel}
        aria-controls={props.ariaControls}
        aria-haspopup={props.hasPopup}
        aria-selected={props.ariaSelected}
        title={props.ariaLabel}
        tabIndex={props.tabIndex}
        dir={props.isRtl ? 'rtl' : undefined}
        style={
          buildStyle(props.style, props.backgroundImage && `background-image: url(${props.backgroundImage})`) ||
          undefined
        }
      >
        {content}
      </button>
    </Show>
  );
};

export default Button;
