import { createSignal } from 'frameact';
import { mergeProps } from 'frameact/dom';

import useOldLang from '../../../hooks/useOldLang';

import Button from '../../ui/Button';
import InputText from '../../ui/InputText';
import Modal from '../../ui/Modal';

import styles from './PromptDialog.module.scss';

export type OwnProps = {
  isOpen: boolean;
  title: string;
  subtitle?: React.ReactNode;
  placeholder: string;
  submitText?: string;
  maxLength?: number;
  initialValue?: string;
  onClose: NoneToVoidFunction;
  onSubmit: (text: string) => void;
};

const PromptDialog = (rawProps: OwnProps) => {
  const props = mergeProps({ initialValue: '' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'initialValue'>>;
  const lang = useOldLang();

  const [text, setText] = createSignal(props.initialValue);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
  };

  const handleSubmit = () => {
    props.onSubmit(text());
  };

  return (
    <Modal className="narrow" title={props.title} isOpen={props.isOpen} onClose={props.onClose} isSlim>
      {Boolean(props.subtitle) && <div class={styles.subtitle}>{props.subtitle}</div>}
      <InputText
        placeholder={props.placeholder}
        value={text()}
        onChange={handleTextChange}
        maxLength={props.maxLength}
      />
      <div class="dialog-buttons mt-2">
        <Button className="confirm-dialog-button" onClick={handleSubmit}>
          {props.submitText || lang('Save')}
        </Button>
        <Button className="confirm-dialog-button" isText onClick={props.onClose}>
          {lang('Cancel')}
        </Button>
      </div>
    </Modal>
  );
};

export default PromptDialog;
