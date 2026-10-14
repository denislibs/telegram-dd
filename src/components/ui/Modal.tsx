import { beginHeavyAnimation, createEffect, createMemo, createMutationEffect, frozenWhile } from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { createShowTransition } from '../../lib/kit';

import type { TextPart } from '../../types';

import buildClassName from '../../util/buildClassName';
import captureKeyboardListeners from '../../util/captureKeyboardListeners';
import { disableDirectTextInput, enableDirectTextInput } from '../../util/directInputManager';
import { countOpenModal } from '../../util/openModals';
import trapFocus from '../../util/trapFocus';

import useContextMenuHandlers from '../../hooks/useContextMenuHandlers';
import useHistoryBack from '../../hooks/useHistoryBack';
import useOldLang from '../../hooks/useOldLang';

import Button, { type OwnProps as ButtonProps } from './Button';
import Menu from './Menu';
import ModalStarBalanceBar from './ModalStarBalanceBar';
import Portal from './Portal';

import './Modal.scss';

export const ANIMATION_DURATION = 200;

export type OwnProps = {
  title?: string | TextPart[];
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
  dialogClassName?: string;
  isOpen?: boolean;
  header?: JSX.Element;
  isSlim?: boolean;
  hasCloseButton?: boolean;
  hasAbsoluteCloseButton?: boolean;
  absoluteCloseButtonColor?: ButtonProps['color'];
  isBackButton?: boolean;
  noBackdrop?: boolean;
  noBackdropClose?: boolean;
  isNativeDialog?: boolean;
  noTitleAutoFocus?: boolean;
  children: React.ReactNode;
  style?: string;
  dialogStyle?: string;
  dialogRef?: (el: HTMLDivElement) => void;
  isLowStackPriority?: boolean;
  dialogContent?: React.ReactNode;
  moreMenuItems?: JSX.Element;
  headerRightToolBar?: JSX.Element;
  withBalanceBar?: boolean;
  currencyInBalanceBar?: 'TON' | 'XTR';
  isCondensedHeader?: boolean;
  noFreezeOnClose?: boolean;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd?: NoneToVoidFunction;
  onEnter?: NoneToVoidFunction;
};

const Modal = (props: OwnProps) => {
  const { ref: modalRef, shouldRender } = createShowTransition({
    isOpen: () => props.isOpen,
    onCloseAnimationEnd: props.onCloseAnimationEnd,
  });

  const shouldFreeze = createMemo(() => !props.noFreezeOnClose && !props.isOpen);
  const frozen = frozenWhile(
    () => props,
    () => shouldFreeze(),
  );
  const title = () => frozen().title;
  const isLowStackPriority = () => frozen().isLowStackPriority;
  const header = () => frozen().header;
  const children = () => frozen().children;
  const className = () => frozen().className;
  const contentClassName = () => frozen().contentClassName;
  const headerClassName = () => frozen().headerClassName;
  const dialogClassName = () => frozen().dialogClassName;
  const isSlim = () => frozen().isSlim;
  const hasCloseButton = () => frozen().hasCloseButton;
  const hasAbsoluteCloseButton = () => frozen().hasAbsoluteCloseButton;
  const absoluteCloseButtonColor = () =>
    frozen().absoluteCloseButtonColor === undefined ? 'translucent' : frozen().absoluteCloseButtonColor;
  const isBackButton = () => frozen().isBackButton;
  const noBackdrop = () => frozen().noBackdrop;
  const style = () => frozen().style;
  const dialogStyle = () => frozen().dialogStyle;
  const dialogContent = () => frozen().dialogContent;
  const moreMenuItems = () => frozen().moreMenuItems;
  const headerToolBar = () => frozen().headerRightToolBar;
  const withBalanceBar = () => frozen().withBalanceBar;
  const isCondensedHeader = () => frozen().isCondensedHeader;
  const currencyInBalanceBar = () =>
    frozen().currencyInBalanceBar === undefined ? 'XTR' : frozen().currencyInBalanceBar;

  let localDialogRef!: HTMLDivElement;
  let moreButtonRef!: HTMLButtonElement;
  let menuRef!: HTMLDivElement;

  const { isContextMenuOpen, contextMenuAnchor, handleContextMenu, handleContextMenuClose, handleContextMenuHide } =
    useContextMenuHandlers(() => moreButtonRef);

  // TODO(codemod): "localDialogRef" was a ref object passed as a value: pass an accessor (() => localDialogRef) or a callback ref
  const actualDialogRef = createMemo(() => props.dialogRef || localDialogRef);
  const divModalRef = modalRef as (el: HTMLDivElement) => void;
  const nativeDialogRef = modalRef as (el: HTMLDialogElement) => void;

  const getRootElement = () => actualDialogRef().current;
  const getTriggerElement = () => moreButtonRef;
  const getMenuElement = () => menuRef;
  const getLayout = () => ({ withPortal: true });

  const withCloseButton = createMemo(() => hasCloseButton() || hasAbsoluteCloseButton());

  createEffect(
    () => props.isOpen,
    () => {
      if (!props.isOpen) {
        return undefined;
      }

      disableDirectTextInput();

      return enableDirectTextInput;
    },
  );

  const handleEnter = (e: KeyboardEvent) => {
    if (!props.onEnter) {
      return false;
    }

    e.preventDefault();
    props.onEnter();
    return true;
  };

  createEffect(
    () => [props.isOpen, props.onClose, handleEnter],
    () => (props.isOpen ? captureKeyboardListeners({ onEsc: props.onClose, onEnter: handleEnter }) : undefined),
  );
  // TODO(codemod): modalRef is a callback ref now: keep the element in a let assigned from ref={(el) => { modalRef(el); element = el; }}
  createEffect(
    () => [props.isOpen, modalRef],
    () => (props.isOpen && modalRef.current ? trapFocus(modalRef.current) : undefined),
  );

  createMutationEffect(
    () => [props.isNativeDialog, nativeDialogRef, shouldRender()],
    ([, , shouldRender]) => {
      if (!props.isNativeDialog || !shouldRender) {
        return undefined;
      }

      const dialog = nativeDialogRef.current;
      if (!dialog) {
        return undefined;
      }

      if (!dialog.open) {
        dialog.showModal();
      }

      return () => {
        if (dialog.open) {
          dialog.close();
        }
      };
    },
  );

  createEffect(
    () => [props.isNativeDialog, props.isOpen, nativeDialogRef, props.onClose, shouldRender()],
    ([, , , , shouldRender]) => {
      if (!props.isNativeDialog || !shouldRender) {
        return undefined;
      }

      const dialog = nativeDialogRef.current;
      if (!dialog) {
        return undefined;
      }

      const handleCancel = (event: Event) => {
        event.preventDefault();

        if (props.isOpen) {
          props.onClose();
        }
      };

      dialog.addEventListener('cancel', handleCancel);

      return () => {
        dialog.removeEventListener('cancel', handleCancel);
      };
    },
  );

  useHistoryBack({
    isActive: () => props.isOpen,
    onBack: props.onClose,
  });

  createMutationEffect(
    () => [props.isOpen],
    (_deps, prev) => {
      const [prevIsOpen] = prev ?? [];
      document.body.classList.toggle('has-open-dialog', Boolean(props.isOpen));

      const stopCounting = props.isOpen ? countOpenModal() : undefined;

      if (props.isOpen || (!props.isOpen && prevIsOpen !== undefined)) {
        beginHeavyAnimation(ANIMATION_DURATION);
      }

      return () => {
        document.body.classList.remove('has-open-dialog');
        stopCounting?.();
      };
    },
  );

  const lang = useOldLang();

  function renderHeader() {
    if (header()) {
      return header();
    }

    const closeIconClassName = buildClassName('animated-close-icon', isBackButton() && 'state-back');

    const closeButton = withCloseButton() ? (
      <Button
        className={buildClassName(hasAbsoluteCloseButton() && 'modal-absolute-close-button')}
        round
        color={absoluteCloseButtonColor()}
        size="tiny"
        ariaLabel={isBackButton() ? lang('Back') : lang('Close')}
        onClick={props.onClose}
      >
        <div class={closeIconClassName} />
      </Button>
    ) : undefined;

    return title() ? (
      <div class={buildClassName('modal-header', headerClassName(), isCondensedHeader() && 'modal-header-condensed')}>
        {closeButton}
        <div class="modal-title" autoFocus={!props.noTitleAutoFocus}>
          {title()}
        </div>
      </div>
    ) : (
      closeButton
    );
  }

  const fullClassName = createMemo(() =>
    buildClassName(
      'Modal',
      className(),
      noBackdrop() && 'transparent-backdrop',
      isSlim() && 'slim',
      isLowStackPriority() && 'low-priority',
      withBalanceBar() && 'with-balance-bar',
    ),
  );

  const modalDialogClassName = createMemo(() => buildClassName('modal-dialog', dialogClassName()));

  function renderContent() {
    return (
      <>
        <div class="modal-container">
          <div class="modal-backdrop" onClick={!props.noBackdropClose ? props.onClose : undefined} />
          {withBalanceBar() && <ModalStarBalanceBar isModalOpen={props.isOpen} currency={currencyInBalanceBar()} />}
          <div class={modalDialogClassName()} ref={actualDialogRef()} style={dialogStyle()}>
            {renderHeader()}
            {headerToolBar()}
            {Boolean(moreMenuItems()) && (
              <>
                <Button
                  ref={moreButtonRef}
                  className="modal-more-button"
                  round
                  color={absoluteCloseButtonColor()}
                  size="tiny"
                  iconName="more"
                  ariaLabel={lang('AriaMoreButton')}
                  onClick={handleContextMenu}
                  onContextMenu={handleContextMenu}
                />
                <Menu
                  ref={menuRef}
                  isOpen={isContextMenuOpen}
                  anchor={contextMenuAnchor}
                  autoClose
                  withPortal
                  positionX="right"
                  onClose={handleContextMenuClose}
                  onCloseAnimationEnd={handleContextMenuHide}
                  getRootElement={getRootElement}
                  getTriggerElement={getTriggerElement}
                  getMenuElement={getMenuElement}
                  getLayout={getLayout}
                >
                  {moreMenuItems()}
                </Menu>
              </>
            )}
            {dialogContent()}
            <div class={buildClassName('modal-content custom-scroll', contentClassName())} style={style()}>
              {children()}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <Show when={shouldRender()}>
      <Portal>
        {props.isNativeDialog ? (
          <dialog ref={nativeDialogRef} class={fullClassName()} aria-modal="true">
            {renderContent()}
          </dialog>
        ) : (
          <div ref={divModalRef} class={fullClassName()} tabIndex={-1} role="dialog">
            {renderContent()}
          </div>
        )}
      </Portal>
    </Show>
  );
};

export default Modal;
