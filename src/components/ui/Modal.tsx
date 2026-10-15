import {
  beginHeavyAnimation,
  createEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  frozenWhile,
  requestMutation,
} from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import type { TextPart } from '../../types';

import { createShowTransition } from '../../lib/kit';
import buildClassName from '../../util/buildClassName';
import captureKeyboardListeners from '../../util/captureKeyboardListeners';
import { disableDirectTextInput, enableDirectTextInput } from '../../util/directInputManager';
import { depsOf } from '../../util/effectDeps';
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
    onCloseAnimationEnd: () => props.onCloseAnimationEnd?.(),
  });

  const shouldFreeze = createMemo(() => !props.noFreezeOnClose && !props.isOpen);
  // Deviation: `useFrozenProps(props, ...)` froze every prop. Here the scalar props are frozen through a snapshot; the
  // node props (`header`, `children`, `dialogContent`, `moreMenuItems`, `headerRightToolBar`) are live JSX that is
  // created once and stays mounted while closing, so they cannot be held back.
  // TODO(port): callers whose content vanishes with its data on close must keep it with `currentOrPrev`.
  const frozen = frozenWhile(
    () => ({
      title: props.title,
      isLowStackPriority: props.isLowStackPriority,
      className: props.className,
      contentClassName: props.contentClassName,
      headerClassName: props.headerClassName,
      dialogClassName: props.dialogClassName,
      isSlim: props.isSlim,
      hasCloseButton: props.hasCloseButton,
      hasAbsoluteCloseButton: props.hasAbsoluteCloseButton,
      absoluteCloseButtonColor: props.absoluteCloseButtonColor,
      isBackButton: props.isBackButton,
      noBackdrop: props.noBackdrop,
      style: props.style,
      dialogStyle: props.dialogStyle,
      withBalanceBar: props.withBalanceBar,
      isCondensedHeader: props.isCondensedHeader,
      currencyInBalanceBar: props.currencyInBalanceBar,
    }),
    () => shouldFreeze(),
  );
  const title = () => frozen().title;
  const isLowStackPriority = () => frozen().isLowStackPriority;
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
  const withBalanceBar = () => frozen().withBalanceBar;
  const isCondensedHeader = () => frozen().isCondensedHeader;
  const currencyInBalanceBar = () =>
    frozen().currencyInBalanceBar === undefined ? 'XTR' : frozen().currencyInBalanceBar;

  // A signal: the portal content is created after `shouldRender` flips, and the effects below wait for the element.
  const [modalElement, setModalElement] = createSignal<HTMLElement | undefined>(undefined);
  let localDialogRef: HTMLDivElement | undefined;
  let moreButtonRef: HTMLButtonElement | undefined;
  let menuRef: HTMLDivElement | undefined;

  const { isContextMenuOpen, contextMenuAnchor, handleContextMenu, handleContextMenuClose, handleContextMenuHide } =
    useContextMenuHandlers(() => moreButtonRef);

  const getRootElement = () => localDialogRef;
  const getTriggerElement = () => moreButtonRef;
  const getMenuElement = () => menuRef;
  const getLayout = () => ({ withPortal: true });

  const withCloseButton = createMemo(() => hasCloseButton() || hasAbsoluteCloseButton());

  createEffect(
    () => props.isOpen,
    (isOpen2) => {
      if (!isOpen2) {
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
    depsOf(() => [props.isOpen, props.onClose, handleEnter] as const),
    ([isOpen2, onClose2]) =>
      isOpen2 ? captureKeyboardListeners({ onEsc: onClose2, onEnter: handleEnter }) : undefined,
  );
  createEffect(
    depsOf(() => [props.isOpen, modalElement()] as const),
    ([isOpen, element]) => (isOpen && element ? trapFocus(element) : undefined),
  );

  createMutationEffect(
    depsOf(() => [props.isNativeDialog, shouldRender(), modalElement()] as const),
    ([isNativeDialog2, isRendered, element]) => {
      if (!isNativeDialog2 || !isRendered) {
        return undefined;
      }

      const dialog = element as HTMLDialogElement | undefined;
      if (!dialog) {
        return undefined;
      }

      if (!dialog.open) {
        if (dialog.isConnected) {
          dialog.showModal();
        } else {
          // Deviation: the portal may not have mounted the content when this runs (a modal that is rendered open by an element
          // that was created in the same frame): `showModal` throws for an element that is not in the document
          requestMutation(() => {
            if (dialog.isConnected && !dialog.open) dialog.showModal();
          });
        }
      }

      return () => {
        if (dialog.open) {
          dialog.close();
        }
      };
    },
  );

  createEffect(
    depsOf(() => [props.isNativeDialog, props.isOpen, props.onClose, shouldRender(), modalElement()] as const),
    ([isNativeDialog2, , , isRendered, element]) => {
      if (!isNativeDialog2 || !isRendered) {
        return undefined;
      }

      const dialog = element as HTMLDialogElement | undefined;
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
    onBack: () => props.onClose(),
  });

  createMutationEffect(
    () => props.isOpen,
    (isOpen, prevIsOpen) => {
      document.body.classList.toggle('has-open-dialog', Boolean(isOpen));

      const stopCounting = isOpen ? countOpenModal() : undefined;

      if (isOpen || (!isOpen && prevIsOpen !== undefined)) {
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
    const header = props.header;
    if (header) {
      return header;
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
        <div class="modal-title" autofocus={!props.noTitleAutoFocus}>
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
          <div
            class="modal-backdrop"
            onClick={() => {
              if (!props.noBackdropClose) props.onClose();
            }}
          />
          {withBalanceBar() && (
            <ModalStarBalanceBar isModalOpen={props.isOpen || undefined} currency={currencyInBalanceBar()} />
          )}
          <div
            class={modalDialogClassName()}
            ref={(el) => {
              localDialogRef = el;
              props.dialogRef?.(el);
            }}
            style={dialogStyle()}
          >
            {renderHeader()}
            {props.headerRightToolBar}
            {Boolean(props.moreMenuItems) && (
              <>
                <Button
                  ref={(el) => {
                    moreButtonRef = el as HTMLButtonElement;
                  }}
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
                  ref={(el) => {
                    menuRef = el;
                  }}
                  isOpen={isContextMenuOpen()}
                  anchor={contextMenuAnchor()}
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
                  {props.moreMenuItems}
                </Menu>
              </>
            )}
            {props.dialogContent}
            <div class={buildClassName('modal-content custom-scroll', contentClassName())} style={style()}>
              {props.children}
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
          <dialog
            ref={(el) => {
              setModalElement(el);
              modalRef(el);
            }}
            class={fullClassName()}
            aria-modal="true"
          >
            {renderContent()}
          </dialog>
        ) : (
          <div
            ref={(el) => {
              setModalElement(el);
              modalRef(el);
            }}
            class={fullClassName()}
            tabIndex={-1}
            role="dialog"
          >
            {renderContent()}
          </div>
        )}
      </Portal>
    </Show>
  );
};

export default Modal;
