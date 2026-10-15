import { createEffect, createMemo, createSignal } from 'frameact';

import useLang from '../../../hooks/useLang';

import Island from '../../gili/layout/Island';
import Button from '../../ui/Button';
import InputText from '../../ui/InputText';
import Modal, { ModalFooterActions, ModalHeader, ModalTitle } from '@gili/modal/Modal';

type OwnProps = {
  isOpen: boolean;
  onClose: NoneToVoidFunction;
  onSubmit: (text: string, url: string) => void;
};

const RichEditorLinkModal = (props: OwnProps) => {
  const [text, setText] = createSignal('');
  const [url, setUrl] = createSignal('');

  const lang = useLang();

  const canSubmit = createMemo(() => Boolean(text().trim() && url().trim()));

  createEffect(
    () => props.isOpen,
    (isOpen2) => {
      if (!isOpen2) {
        setText('');
        setUrl('');
      }
    },
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.currentTarget.value);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.currentTarget.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit()) {
      return;
    }

    props.onSubmit(text(), url());
  };

  const header = createMemo(() => (
    <ModalHeader>
      <ModalTitle noAutoFocus>{lang('CreateLink')}</ModalTitle>
    </ModalHeader>
  ));

  return (
    <Modal
      isOpen={props.isOpen}
      header={header()}
      width="slim"
      height="auto"
      ariaLabel={lang('CreateLink')}
      onClose={props.onClose}
    >
      <form action="" onSubmit={handleSubmit}>
        <Island>
          <InputText value={text()} label={lang('Text')} autoFocus onChange={handleTextChange} />
          <InputText
            value={url()}
            label={lang('FormattingLinkUrl')}
            inputMode="url"
            noMargin
            onChange={handleUrlChange}
          />
        </Island>
        <ModalFooterActions>
          <Button isText size="smaller" color="primary" fluid onClick={props.onClose}>
            {lang('Cancel')}
          </Button>
          <Button isText size="smaller" color="primary" fluid type="submit" disabled={!canSubmit()}>
            {lang('Create')}
          </Button>
        </ModalFooterActions>
      </form>
    </Modal>
  );
};

export default RichEditorLinkModal;
