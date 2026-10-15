import {
  createContext,
  createEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  frozenWhile,
  onMount,
  requestMutation,
} from 'frameact';
import { mergeProps, Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { depsOf } from '../../../util/effectDeps';

import buildClassName from '../../../util/buildClassName';
import captureKeyboardListeners from '../../../util/captureKeyboardListeners';
import { waitForAnimationEnd } from '../../../util/cssAnimationEndListeners';
import { disableDirectTextInput, enableDirectTextInput } from '../../../util/directInputManager';
import { countOpenModal } from '../../../util/openModals';

import useContext from '../../../hooks/data/useContext';
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

const Modal = (rawProps: ModalProps) => {
  const props = mergeProps({ width: 'regular', height: 'regular' }, rawProps) as ModalProps &
    Required<Pick<ModalProps, 'width' | 'height'>>;
  const [hasEverOpened, setHasEverOpened] = createSignal(Boolean(props.isOpen));
  const [shouldRender, setShouldRender] = createSignal(Boolean(props.isOpen));
  const [isClosing, setIsClosing] = createSignal(false);
  const [hasTitle, setHasTitle] = createSignal(false);
  const [hasSubtitle, setHasSubtitle] = createSignal(false);

  let dialogRef!: HTMLDialogElement;
  let panelRef!: HTMLDivElement;
  let closeAnimationCleanupRef: NoneToVoidFunction | undefined;

  const uniqueId = useUniqueId();
  const titleId = `modal-title-${uniqueId}`;
  const subtitleId = `modal-subtitle-${uniqueId}`;

  const frozenProps = frozenWhile(
    () => ({
      header: props.header,
      children: props.children,
      stickyFooter: props.stickyFooter,
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

  const shouldShowHeader = createMemo(() => Boolean(frozenProps().header));

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

  const contextValue = createMemo<ModalContextType>(() => ({
    onClose: handleRequestClose,
    titleId,
    subtitleId,
    hasSubtitle: hasSubtitle(),
    registerTitle,
    registerSubtitle,
  }));

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

  createMutationEffect(
    () => shouldRender(),
    (shouldRender2) => {
      if (!shouldRender2) {
        return undefined;
      }

      const dialogElement = dialogRef;

      if (!dialogElement) {
        return undefined;
      }

      if (!dialogElement.open) {
        dialogElement.showModal();
      }

      return () => {
        cleanupCloseAnimation();

        if (dialogElement.open) {
          dialogElement.close();
        }
      };
    },
  );

  createEffect(
    depsOf(() => [handleEsc, shouldRender()] as const),
    ([, shouldRender2]) => {
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
    depsOf(() => [isClosing(), props.isOpen, props.noLightDismiss, shouldRender()] as const),
    ([isClosing2, isOpen2, noLightDismiss2, shouldRender2]) => {
      if (!shouldRender2) {
        return undefined;
      }

      const dialogElement = dialogRef;

      if (!dialogElement) {
        return undefined;
      }

      const handleCancel = (event: Event) => {
        event.preventDefault();

        if (noLightDismiss2 || !isOpen2 || isClosing2) {
          return;
        }

        handleRequestClose();
      };

      dialogElement.addEventListener('cancel', handleCancel);

      return () => {
        dialogElement.removeEventListener('cancel', handleCancel);
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
    <Show when={!(!shouldRender() && !(props.keepMounted && hasEverOpened()))}>
      <Portal>
        <ModalContext.Provider value={contextValue()}>
          <dialog
            ref={dialogRef}
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
            <div ref={panelRef} class={styles.panel}>
              {shouldShowHeader() && <div class={styles.headerSlot}>{frozenProps().header}</div>}

              <Surface
                scrollable={!frozenProps().noScrollable}
                noPadding={frozenProps().noContentInlinePadding}
                className={buildClassName(
                  styles.content,
                  shouldShowHeader() && styles.withHeader,
                  frozenProps().contentClassName,
                )}
              >
                <div class={styles.body}>{frozenProps().children}</div>
              </Surface>
              {Boolean(frozenProps().stickyFooter) && (
                <div class={styles.stickyFooter}>{frozenProps().stickyFooter}</div>
              )}
            </div>
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
