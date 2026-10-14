import { createMemo, createSignal } from 'frameact';
import { mergeProps } from 'frameact/dom';

import type { IAnchorPosition } from '../../types';

import Button from './Button';
import Menu from './Menu';

import './DropdownMenu.scss';

type OwnProps = {
  className?: string;
  bubbleClassName?: string;
  trigger?: FC<{ onTrigger: () => void; isOpen?: boolean }>;
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
  let menuRef!: HTMLDivElement;
  let triggerRef!: HTMLDivElement;
  const [isOpen, setIsOpen] = createSignal(false);
  const [menuAnchor, setMenuAnchor] = createSignal<IAnchorPosition | undefined>(undefined);

  const toggleIsOpen = () => {
    if (!isOpen() && props.withPortal && triggerRef) {
      const rect = triggerRef.getBoundingClientRect();
      setMenuAnchor({ x: rect.left, y: rect.bottom });
    }

    setIsOpen(!isOpen());

    if (isOpen()) {
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

  const triggerComponent: FC<{ onTrigger: () => void; isOpen?: boolean }> = createMemo(() => {
    if (props.trigger) return props.trigger;

    return ({ onTrigger, isOpen: isMenuOpen }) => (
      <Button
        round
        size="smaller"
        color="translucent"
        className={isMenuOpen ? 'active' : ''}
        iconName="more"
        onClick={onTrigger}
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
      {triggerComponent()({ onTrigger: toggleIsOpen, isOpen: isOpen() })}

      <Menu
        ref={menuRef}
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
