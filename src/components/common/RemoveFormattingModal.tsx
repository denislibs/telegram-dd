import { createMemo } from 'frameact';

import useLang from '../../hooks/useLang';

import Button from '../ui/Button';
import Modal, { ModalCloseButton, ModalFooterActions, ModalHeader, ModalTitle } from '@gili/modal/Modal';

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

  const header = createMemo(() => (
    <ModalHeader>
      <ModalCloseButton />
      <ModalTitle>{title()}</ModalTitle>
    </ModalHeader>
  ));

  return (
    <Modal
      isOpen={props.isOpen}
      header={header()}
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
