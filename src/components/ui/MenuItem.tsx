import { createMemo } from 'frameact';
import { mergeProps, Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { IconName } from '../../types/icons';

import { IS_TEST } from '../../config';
import buildClassName from '../../util/buildClassName';

import useAppLayout from '../../hooks/useAppLayout';
import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';

import './MenuItem.scss';

export type MenuItemProps = {
  customIcon?: JSX.Element;
  className?: string;
  children: JSX.Element;
  href?: string;
  rel?: string;
  target?: string;
  download?: string;
  disabled?: boolean;
  destructive?: boolean;
  ariaLabel?: string;
  withWrap?: boolean;
  withPreventDefaultOnMouseDown?: boolean;
  hasIconPremiumBadge?: boolean;
  clickArg?: number;
  onClick?: (e: React.SyntheticEvent<HTMLDivElement | HTMLAnchorElement>, arg?: number) => void;
  onContextMenu?: (e: React.UIEvent) => void;
} & (
  | {
      icon: 'A' | 'K';
      isCharIcon: true;
    }
  | {
      icon?: IconName;
      isCharIcon?: false;
    }
);

type TextProps = {
  children: JSX.Element;
  className?: string;
};

const MenuItem = (rawProps: MenuItemProps) => {
  const props = mergeProps({ rel: 'noopener noreferrer' }, rawProps) as MenuItemProps &
    Required<Pick<MenuItemProps, 'rel'>>;

  const lang = useLang();
  const { isTouchScreen } = useAppLayout();
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (props.disabled || !props.onClick) {
      e.preventDefault();
      return;
    }
    props.onClick(e, props.clickArg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.keyCode !== 13 && e.keyCode !== 32) {
      return;
    }

    if (props.disabled || !props.onClick) {
      e.preventDefault();

      return;
    }
    props.onClick(e, props.clickArg);
  };
  const handleMouseDown = (e: React.SyntheticEvent<HTMLDivElement | HTMLAnchorElement>) => {
    if (props.withPreventDefaultOnMouseDown) {
      e.preventDefault();
    }
  };

  const fullClassName = createMemo(() =>
    buildClassName(
      'MenuItem',
      props.className,
      props.disabled && 'disabled',
      props.destructive && 'destructive',
      !isTouchScreen && 'compact',
      props.withWrap && 'wrap',
      !props.icon && !props.customIcon && 'text-only',
    ),
  );

  const content = (
    <>
      {!props.customIcon && props.icon && (
        <Icon
          name={props.isCharIcon ? 'char' : props.icon}
          character={props.isCharIcon ? props.icon : undefined}
          hasPremiumBadge={props.hasIconPremiumBadge}
        />
      )}
      {props.customIcon}
      {props.children}
    </>
  );

  return (
    <Show
      when={!(props.href && !props.disabled)}
      fallback={
        <a
          tabIndex={0}
          class={fullClassName()}
          href={props.href}
          download={props.download}
          aria-label={props.ariaLabel}
          title={props.ariaLabel}
          target={props.target || (props.href.startsWith(window.location.origin) || IS_TEST ? '_self' : '_blank')}
          rel={props.rel}
          dir={lang.isRtl ? 'rtl' : undefined}
          onClick={props.onClick}
          onMouseDown={handleMouseDown}
        >
          {content}
        </a>
      }
    >
      <div
        role="menuitem"
        tabIndex={props.disabled ? -1 : 0}
        class={fullClassName()}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onContextMenu={props.onContextMenu}
        aria-label={props.ariaLabel}
        title={props.ariaLabel}
        dir={lang.isRtl ? 'rtl' : undefined}
      >
        {content}
      </div>
    </Show>
  );
};

function MenuItemTitle(props: TextProps) {
  return <span class={buildClassName('menuItemTitle', props.className)}>{props.children}</span>;
}

function MenuItemSubtitle(props: TextProps) {
  return <span class={buildClassName('menuItemSubtitle', props.className)}>{props.children}</span>;
}

export default MenuItem;
export { MenuItemTitle, MenuItemSubtitle };
