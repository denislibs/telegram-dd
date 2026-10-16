import { createMemo } from 'frameact';

import useLang from '../../hooks/useLang';

// Deviation: the `@gili/*` alias of tt's tsconfig does not exist here: a relative path.
import Modal, { ModalCloseButton, ModalFooterActions, ModalHeader, ModalTitle } from '../gili/modal/Modal';
import Button from '../ui/Button';

type OwnProps = {
  isOpen: boolean;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd: NoneToVoidFunction;
  onRemoveFormatting: NoneToVoidFunction;
  onSubscribeToPremium: NoneToVoidFunction;
};

const RemoveFormattingModal = (props: OwnProps) => {
  const lang = useLang();
  const title = createMemo(() => lang('RemoveRichFormattingTitle'));

  return (
    <Modal
      isOpen={props.isOpen}
      // Deviation: the header is passed as JSX (tt memoized it): the modal creates it once inside its context provider,
      // where `ModalTitle` / `ModalCloseButton` find the modal context; a memo of this component would create it outside.
      header={
        <ModalHeader>
          <ModalCloseButton />
          <ModalTitle>{title()}</ModalTitle>
        </ModalHeader>
      }
      width="slim"
      height="auto"
      ariaLabel={title()}
      onClose={props.onClose}
      onCloseAnimationEnd={props.onCloseAnimationEnd}
    >
      <p>{lang('RemoveRichFormattingText', undefined, { withNodes: true, withMarkdown: true })}</p>
      <ModalFooterActions isVertical>
        <Button size="smaller" color="primary" fluid onClick={props.onSubscribeToPremium}>
          {lang('RichFormattingSubscribe')}
        </Button>
        <Button isText size="smaller" color="primary" fluid onClick={props.onRemoveFormatting}>
          {lang('RemoveRichFormatting')}
        </Button>
      </ModalFooterActions>
    </Modal>
  );
};

export default RemoveFormattingModal;
