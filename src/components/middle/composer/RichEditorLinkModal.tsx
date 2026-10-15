import { createEffect, createMemo, createSignal } from 'frameact';

import useLang from '../../../hooks/useLang';

import Island from '../../gili/layout/Island';
// Deviation: the `@gili/*` alias of tt's tsconfig does not exist here: a relative path.
import Modal, { ModalFooterActions, ModalHeader, ModalTitle } from '../../gili/modal/Modal';
import Button from '../../ui/Button';
import InputText from '../../ui/InputText';

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

  return (
    <Modal
      isOpen={props.isOpen}
      // Deviation: the header is passed as JSX (tt memoized it): the modal creates it once inside its context provider,
      // where `ModalTitle` finds the modal context; a memo of this component would create it outside.
      header={
        <ModalHeader>
          <ModalTitle noAutoFocus>{lang('CreateLink')}</ModalTitle>
        </ModalHeader>
      }
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
