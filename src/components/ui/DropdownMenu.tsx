import { createMemo, createSignal } from 'frameact';
import { Dynamic, mergeProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { IAnchorPosition } from '../../types';

import Button from './Button';
import Menu from './Menu';

import './DropdownMenu.scss';

// Deviation: a component (a function of reactive props) instead of teact's FC called as a function: read
// `props.isOpen` / `props.onTrigger` where used, never destructure them.
type TriggerProps = { onTrigger: () => void; isOpen?: boolean };
type TriggerComponent = (props: TriggerProps) => JSX.Element;

type OwnProps = {
  className?: string;
  bubbleClassName?: string;
  trigger?: TriggerComponent;
  transformOriginX?: number;
  transformOriginY?: number;
  positionX?: 'left' | 'right';
  positionY?: 'top' | 'bottom';
  footer?: string;
  forceOpen?: boolean;
  withPortal?: boolean;
  onOpen?: NoneToVoidFunction;
  onClose?: NoneToVoidFunction;
  onHide?: NoneToVoidFunction;
  onTransitionEnd?: NoneToVoidFunction;
  onMouseEnterBackdrop?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  children: React.ReactNode;
  autoClose?: boolean;
};

const DropdownMenu = (rawProps: OwnProps) => {
  const props = mergeProps({ positionX: 'left', autoClose: true }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'positionX' | 'autoClose'>>;
  let menuRef: HTMLDivElement | undefined;
  let triggerRef!: HTMLDivElement;
  const [isOpen, setIsOpen] = createSignal(false);
  const [menuAnchor, setMenuAnchor] = createSignal<IAnchorPosition | undefined>(undefined);

  const toggleIsOpen = () => {
    if (!isOpen() && props.withPortal && triggerRef) {
      const rect = triggerRef.getBoundingClientRect();
      setMenuAnchor({ x: rect.left, y: rect.bottom });
    }

    // Deviation: a signal write is visible at once, so the value before the toggle is kept (tt's closure value).
    const wasOpen = isOpen();
    setIsOpen(!wasOpen);

    if (wasOpen) {
      props.onClose?.();
    } else {
      props.onOpen?.();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<any>) => {
    const menu = menuRef;

    if (!isOpen() || e.keyCode !== 40 || !menu) {
      return;
    }

    const focusedElement = document.activeElement;
    const elementChildren = Array.from(menu.children);

    if (!focusedElement || elementChildren.indexOf(focusedElement) === -1) {
      (elementChildren[0] as HTMLElement).focus();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    props.onClose?.();
  };

  const triggerComponent = createMemo<TriggerComponent>(() => {
    if (props.trigger) return props.trigger;

    return (triggerProps) => (
      <Button
        round
        size="smaller"
        color="translucent"
        className={triggerProps.isOpen ? 'active' : ''}
        iconName="more"
        onClick={triggerProps.onTrigger}
        ariaLabel="More actions"
      />
    );
  });

  const getTriggerElement = () => triggerRef;
  const getRootElement = () => document.body;
  const getMenuElement = () => menuRef;
  const getLayout = () => ({ withPortal: true });

  return (
    <div
      ref={triggerRef}
      class={`DropdownMenu ${props.className || ''}`}
      onKeyDown={handleKeyDown}
      onTransitionEnd={props.onTransitionEnd}
    >
      <Dynamic component={triggerComponent()} onTrigger={toggleIsOpen} isOpen={isOpen()} />

      <Menu
        ref={(el) => {
          menuRef = el;
        }}
        isOpen={isOpen() || Boolean(props.forceOpen)}
        className={props.className || ''}
        bubbleClassName={props.bubbleClassName || ''}
        transformOriginX={props.transformOriginX}
        transformOriginY={props.transformOriginY}
        positionX={props.positionX}
        positionY={props.positionY}
        footer={props.footer}
        autoClose={props.autoClose}
        withPortal={props.withPortal}
        onClose={handleClose}
        onCloseAnimationEnd={props.onHide}
        onMouseEnterBackdrop={props.onMouseEnterBackdrop}
        {...(props.withPortal && menuAnchor()
          ? {
              anchor: menuAnchor(),
              getTriggerElement,
              getRootElement,
              getMenuElement,
              getLayout,
            }
          : undefined)}
      >
        {props.children}
      </Menu>
    </div>
  );
};

export default DropdownMenu;
