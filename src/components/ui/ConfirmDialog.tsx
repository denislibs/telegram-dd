import { createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';

import type { TextPart } from '../../types';

import buildClassName from '../../util/buildClassName';

import useKeyboardListNavigation from '../../hooks/useKeyboardListNavigation';
import useLang from '../../hooks/useLang';

import Button from './Button';
import Modal from './Modal';

type OwnProps = {
  isOpen: boolean;
  title?: string;
  noDefaultTitle?: boolean;
  header?: JSX.Element;
  textParts?: TextPart;
  text?: string;
  confirmLabel?: JSX.Element;
  confirmIsDestructive?: boolean;
  isConfirmDisabled?: boolean;
  isConfirmLoading?: boolean;
  isOnlyConfirm?: boolean;
  areButtonsInColumn?: boolean;
  className?: string;
  children?: React.ReactNode;
  confirmHandler: NoneToVoidFunction;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd?: NoneToVoidFunction;
};

const ConfirmDialog = (props: OwnProps) => {
  const lang = useLang();

  let containerRef!: HTMLDivElement;

  const isConfirmBlocked = createMemo(() => props.isConfirmDisabled || props.isConfirmLoading);

  // Enter confirms past the button, so it has to honour the block as well
  const handleSelectWithEnter = (index: number) => {
    if (index === -1 && !isConfirmBlocked()) props.confirmHandler();
  };

  const handleKeyDown = useKeyboardListNavigation(
    () => containerRef,
    () => props.isOpen,
    handleSelectWithEnter,
    '.Button',
  );

  return (
    <Modal
      className={buildClassName('confirm', props.className)}
      title={props.title || (!props.noDefaultTitle ? lang('Telegram') : undefined)}
      header={props.header}
      isOpen={props.isOpen}
      onClose={props.onClose}
      isNativeDialog
      onCloseAnimationEnd={props.onCloseAnimationEnd}
      noTitleAutoFocus
    >
      {props.text && props.text.split('\\n').map((textPart) => <p>{textPart}</p>)}
      {props.textParts || props.children}
      <div
        class={props.areButtonsInColumn ? 'dialog-buttons-column' : 'dialog-buttons mt-2'}
        ref={containerRef}
        onKeyDown={handleKeyDown}
      >
        <Button
          className="confirm-dialog-button"
          isText
          inline
          onClick={props.confirmHandler}
          color={props.confirmIsDestructive ? 'danger' : 'primary'}
          isLoading={props.isConfirmLoading}
          disabled={isConfirmBlocked()}
          autoFocus={!props.confirmIsDestructive}
        >
          {props.confirmLabel || lang('GeneralConfirm')}
        </Button>
        {!props.isOnlyConfirm && (
          <Button
            className="confirm-dialog-button"
            isText
            onClick={props.onClose}
            autoFocus={props.confirmIsDestructive}
          >
            {lang('Cancel')}
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
