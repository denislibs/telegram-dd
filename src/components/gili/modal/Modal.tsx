import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  frozenWhile,
  onMount,
  requestMutation,
  useContext,
} from 'frameact';
import { children, mergeProps, Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../../util/buildClassName';
import captureKeyboardListeners from '../../../util/captureKeyboardListeners';
import { waitForAnimationEnd } from '../../../util/cssAnimationEndListeners';
import { disableDirectTextInput, enableDirectTextInput } from '../../../util/directInputManager';
import { depsOf } from '../../../util/effectDeps';
import { countOpenModal } from '../../../util/openModals';

import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useUniqueId from '../../../hooks/useUniqueId';

import Button from '../../ui/Button';
import Portal from '../../ui/Portal';
import Surface from '../layout/Surface';

import styles from './Modal.module.scss';

const CLOSE_ANIMATION_DURATION = 200;

let openModalCount = 0;

export type ModalWidth = 'slim' | 'regular' | 'wide' | 'fullscreen';
export type ModalHeight = 'auto' | 'regular' | 'tall' | 'fullscreen';

export type ModalProps = {
  isOpen: boolean;
  children: JSX.Element;
  header?: JSX.Element;
  dialogClassName?: string;
  contentClassName?: string;
  width?: ModalWidth;
  height?: ModalHeight;
  noBackdrop?: boolean;
  noLightDismiss?: boolean;
  noScrollable?: boolean;
  noContentInlinePadding?: boolean;
  keepMounted?: boolean;
  stickyFooter?: JSX.Element;
  ariaLabel?: string;
  noContainment?: boolean;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd?: NoneToVoidFunction;
  onEsc?: NoneToVoidFunction;
};

type ModalContextType = {
  titleId: string;
  subtitleId: string;
  hasSubtitle: boolean;
  onClose: NoneToVoidFunction;
  registerTitle: (isPresent: boolean) => void;
  registerSubtitle: (isPresent: boolean) => void;
};

type ModalSlotProps = {
  className?: string;
  children?: JSX.Element;
};

type ModalHeaderProps = {
  noMask?: boolean;
} & ModalSlotProps;

type ModalFooterActionsProps = {
  isVertical?: boolean;
} & ModalSlotProps;

type ModalTitleProps = {
  noAutoFocus?: boolean;
} & ModalSlotProps;

type ModalCloseButtonProps = {
  asAbsolute?: boolean;
  className?: string;
  // Turns the cross into a back arrow
  onBack?: NoneToVoidFunction;
};

const ModalContext = createContext<ModalContextType | undefined>(undefined);

const WIDTH_CLASS_NAME: Record<ModalWidth, string> = {
  slim: styles.widthSlim,
  regular: styles.widthRegular,
  wide: styles.widthWide,
  fullscreen: styles.widthFullscreen,
};

const HEIGHT_CLASS_NAME: Record<ModalHeight, string> = {
  auto: styles.heightAuto,
  regular: styles.heightRegular,
  tall: styles.heightTall,
  fullscreen: styles.heightFullscreen,
};

// Deviation: tt's `useContext` hook (hooks/data/useContext.ts) is frameact's `useContext`; the provided value is an
// object with getters (the provider reads its value once), so `hasSubtitle` stays reactive for the consumers.
function useModalContext() {
  return useContext(ModalContext);
}

function addBodyDialogClass() {
  openModalCount += 1;

  const stopCounting = countOpenModal();

  requestMutation(() => {
    document.body.classList.add('has-open-dialog');
  });

  return () => {
    openModalCount = Math.max(0, openModalCount - 1);
    stopCounting();

    if (!openModalCount) {
      requestMutation(() => {
        document.body.classList.remove('has-open-dialog');
      });
    }
  };
}

type FrozenModalProps = Pick<
  ModalProps,
  | 'dialogClassName'
  | 'contentClassName'
  | 'noBackdrop'
  | 'noScrollable'
  | 'noContentInlinePadding'
  | 'ariaLabel'
  | 'noContainment'
> &
  Required<Pick<ModalProps, 'width' | 'height'>>;

// Deviation: tt rendered the panel inline. It is its own component so that the header and the sticky footer (which
// contain `ModalTitle` / `ModalSubtitle`, readers of the modal context) are created inside the context provider; the
// props of the modal are read where the JSX of a prop is created, once (`children`), not once per read.
const ModalPanel = (p: {
  modalProps: ModalProps;
  frozenProps: Accessor<FrozenModalProps>;
  panelRef: (el: HTMLDivElement) => void;
}) => {
  const header = children(() => p.modalProps.header);
  const stickyFooter = children(() => p.modalProps.stickyFooter);
  const shouldShowHeader = createMemo(() => header.toArray().length > 0);
  const shouldShowStickyFooter = createMemo(() => stickyFooter.toArray().length > 0);

  return (
    <div ref={p.panelRef} class={styles.panel}>
      <Show when={shouldShowHeader()}>
        <div class={styles.headerSlot}>{header() as JSX.Element}</div>
      </Show>

      <Surface
        scrollable={!p.frozenProps().noScrollable}
        noPadding={p.frozenProps().noContentInlinePadding}
        className={buildClassName(
          styles.content,
          shouldShowHeader() && styles.withHeader,
          p.frozenProps().contentClassName,
        )}
      >
        <div class={styles.body}>{p.modalProps.children}</div>
      </Surface>
      <Show when={shouldShowStickyFooter()}>
        <div class={styles.stickyFooter}>{stickyFooter() as JSX.Element}</div>
      </Show>
    </div>
  );
};

const Modal = (rawProps: ModalProps) => {
  const props = mergeProps({ width: 'regular', height: 'regular' }, rawProps) as ModalProps &
    Required<Pick<ModalProps, 'width' | 'height'>>;
  const [hasEverOpened, setHasEverOpened] = createSignal(Boolean(props.isOpen));
  const [shouldRender, setShouldRender] = createSignal(Boolean(props.isOpen));
  const [isClosing, setIsClosing] = createSignal(false);
  const [hasTitle, setHasTitle] = createSignal(false);
  const [hasSubtitle, setHasSubtitle] = createSignal(false);

  // Deviation: the dialog is created by the `<Show>` below after `shouldRender` flips, so the effects that need the
  // element wait for it through a signal (a plain `let` assigned at creation could be read before it exists).
  const [dialogElement, setDialogElement] = createSignal<HTMLDialogElement | undefined>(undefined);
  let panelRef: HTMLDivElement | undefined;
  let closeAnimationCleanupRef: NoneToVoidFunction | undefined;

  const uniqueId = useUniqueId();
  const titleId = `modal-title-${uniqueId}`;
  const subtitleId = `modal-subtitle-${uniqueId}`;

  // Deviation: `useFrozenProps` froze every prop. The node props (`header`, `children`, `stickyFooter`) are live JSX that
  // is created once and stays mounted while the modal closes, so they cannot be held back; the scalar props are frozen.
  // TODO(port): callers whose content vanishes with its data on close must keep it with `currentOrPrev`.
  const frozenProps = frozenWhile(
    () => ({
      dialogClassName: props.dialogClassName,
      contentClassName: props.contentClassName,
      width: props.width,
      height: props.height,
      noBackdrop: props.noBackdrop,
      noScrollable: props.noScrollable,
      noContentInlinePadding: props.noContentInlinePadding,
      ariaLabel: props.ariaLabel,
      noContainment: props.noContainment,
    }),
    () => !props.isOpen,
  );

  const cleanupCloseAnimation = () => {
    closeAnimationCleanupRef?.();
    closeAnimationCleanupRef = undefined;
  };

  const finishClose = () => {
    cleanupCloseAnimation();
    setIsClosing(false);
    setShouldRender(false);
    props.onCloseAnimationEnd?.();
  };

  const handleRequestClose = () => {
    if (isClosing()) return;

    props.onClose();
  };

  const handleEsc = (event: KeyboardEvent) => {
    if (props.noLightDismiss || !props.isOpen || isClosing()) return;

    event.preventDefault();

    if (props.onEsc) {
      props.onEsc();
      return;
    }

    handleRequestClose();
  };

  const registerTitle = (isPresent: boolean) => {
    setHasTitle(isPresent);
  };

  const registerSubtitle = (isPresent: boolean) => {
    setHasSubtitle(isPresent);
  };

  const contextValue: ModalContextType = {
    onClose: handleRequestClose,
    titleId,
    subtitleId,
    get hasSubtitle() {
      return hasSubtitle();
    },
    registerTitle,
    registerSubtitle,
  };

  createEffect(
    depsOf(() => [hasEverOpened(), props.isOpen] as const),
    ([hasEverOpened2, isOpen2]) => {
      if (isOpen2 && !hasEverOpened2) {
        setHasEverOpened(true);
      }
    },
  );

  createEffect(
    depsOf(() => [isClosing(), props.isOpen, shouldRender()] as const),
    ([isClosing2, isOpen2, shouldRender2]) => {
      if (isOpen2) {
        cleanupCloseAnimation();

        if (!shouldRender2) {
          setShouldRender(true);
          return;
        }

        if (isClosing2) {
          setIsClosing(false);
        }

        return;
      }

      if (!shouldRender2 || isClosing2) {
        return;
      }

      setIsClosing(true);
    },
  );

  createEffect(
    () => isClosing(),
    (isClosing2) => {
      if (!isClosing2) {
        cleanupCloseAnimation();
        return undefined;
      }

      const panelElement = panelRef;

      if (!panelElement) {
        finishClose();
        return undefined;
      }

      if (document.body.classList.contains('no-page-transitions')) {
        finishClose();
        return undefined;
      }

      closeAnimationCleanupRef = waitForAnimationEnd(
        panelElement,
        finishClose,
        undefined,
        CLOSE_ANIMATION_DURATION + 100,
      );

      return cleanupCloseAnimation;
    },
  );

  // The element signal may still hold a dialog that the `<Show>` removed: only a connected one counts.
  const liveDialog = () => {
    const element = dialogElement();
    return shouldRender() && element?.isConnected ? element : undefined;
  };

  createMutationEffect(liveDialog, (dialog) => {
    if (!dialog) {
      return undefined;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    return () => {
      cleanupCloseAnimation();

      if (dialog.open) {
        dialog.close();
      }
    };
  });

  createEffect(
    () => shouldRender(),
    (shouldRender2) => {
      if (!shouldRender2) {
        return undefined;
      }

      return captureKeyboardListeners({ onEsc: handleEsc });
    },
  );

  createEffect(
    () => shouldRender(),
    (shouldRender2) => {
      if (!shouldRender2) {
        return undefined;
      }

      return addBodyDialogClass();
    },
  );

  createEffect(
    () => shouldRender(),
    (shouldRender2) => {
      if (!shouldRender2) {
        return undefined;
      }

      disableDirectTextInput();

      return enableDirectTextInput;
    },
  );

  createEffect(
    depsOf(() => [isClosing(), props.isOpen, props.noLightDismiss, liveDialog()] as const),
    ([isClosing2, isOpen2, noLightDismiss2, dialog]) => {
      if (!dialog) {
        return undefined;
      }

      const handleCancel = (event: Event) => {
        event.preventDefault();

        if (noLightDismiss2 || !isOpen2 || isClosing2) {
          return;
        }

        handleRequestClose();
      };

      dialog.addEventListener('cancel', handleCancel);

      return () => {
        dialog.removeEventListener('cancel', handleCancel);
      };
    },
  );

  useHistoryBack({
    isActive: () => Boolean(props.isOpen && !props.noLightDismiss),
    onBack: handleRequestClose,
  });

  const handleDialogClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget || props.noLightDismiss || !props.isOpen || isClosing()) {
      return;
    }

    handleRequestClose();
  };

  return (
    <Show when={shouldRender() || (props.keepMounted && hasEverOpened())}>
      <Portal>
        <ModalContext.Provider value={contextValue}>
          <dialog
            ref={setDialogElement}
            class={buildClassName(
              styles.dialog,
              WIDTH_CLASS_NAME[frozenProps().width],
              HEIGHT_CLASS_NAME[frozenProps().height],
              frozenProps().noBackdrop && styles.noBackdrop,
              (frozenProps().width === 'fullscreen' || frozenProps().height === 'fullscreen') && styles.fullscreen,
              isClosing() ? styles.closing : styles.open,
              frozenProps().dialogClassName,
              !frozenProps().noContainment && styles.contained,
            )}
            aria-modal="true"
            aria-label={!hasTitle() ? frozenProps().ariaLabel : undefined}
            aria-labelledby={hasTitle() ? titleId : undefined}
            aria-describedby={hasSubtitle() ? subtitleId : undefined}
            onClick={handleDialogClick}
          >
            <ModalPanel
              modalProps={props}
              frozenProps={frozenProps}
              panelRef={(el) => {
                panelRef = el;
              }}
            />
          </dialog>
        </ModalContext.Provider>
      </Portal>
    </Show>
  );
};

const ModalHeader = (props: ModalHeaderProps) => {
  const modalContext = useModalContext();

  return (
    <div
      class={buildClassName(
        styles.header,
        modalContext?.hasSubtitle && styles.headerWithSubtitle,
        !props.noMask && styles.scrollMask,
        props.className,
      )}
    >
      {props.children}
    </div>
  );
};

const ModalHeaderAction = (props: ModalSlotProps) => {
  return <div class={buildClassName(styles.headerAction, props.className)}>{props.children}</div>;
};

const ModalFooterActions = (props: ModalFooterActionsProps) => {
  return (
    <div
      class={buildClassName(styles.footerActions, props.isVertical && styles.footerActionsVertical, props.className)}
    >
      {props.children}
    </div>
  );
};

const ModalTitle = (props: ModalTitleProps) => {
  const modalContext = useModalContext();

  onMount(() => {
    modalContext?.registerTitle(true);

    return () => {
      modalContext?.registerTitle(false);
    };
  });

  return (
    <div
      id={modalContext?.titleId}
      class={buildClassName(styles.title, props.className)}
      dir="auto"
      tabIndex={-1}
      autofocus={!props.noAutoFocus}
    >
      {props.children}
    </div>
  );
};

const ModalSubtitle = (props: ModalSlotProps) => {
  const modalContext = useModalContext();

  onMount(() => {
    modalContext?.registerSubtitle(true);

    return () => {
      modalContext?.registerSubtitle(false);
    };
  });

  return (
    <div id={modalContext?.subtitleId} class={buildClassName(styles.subtitle, props.className)} dir="auto">
      {props.children}
    </div>
  );
};

const ModalCloseButton = (props: ModalCloseButtonProps) => {
  const lang = useLang();
  const modalContext = useModalContext();

  const handleClick = () => {
    if (props.onBack) {
      props.onBack();
      return;
    }

    modalContext?.onClose();
  };

  return (
    <Button
      round
      color="translucent"
      size="tiny"
      ariaLabel={props.onBack ? lang('Back') : lang('Close')}
      className={buildClassName(styles.closeButton, props.asAbsolute && styles.closeButtonAbsolute, props.className)}
      onClick={handleClick}
    >
      <div class={buildClassName('animated-close-icon', props.onBack && 'state-back')} />
    </Button>
  );
};

export default Modal;
export { ModalHeader, ModalHeaderAction, ModalFooterActions, ModalTitle, ModalSubtitle, ModalCloseButton };
