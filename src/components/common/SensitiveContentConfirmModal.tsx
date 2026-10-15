import { withGlobal } from '../../global';

import type { GlobalState } from '../../global/types';

import { VERIFY_AGE_MIN_DEFAULT } from '../../config';

import useLang from '../../hooks/useLang';

import Checkbox from '../ui/Checkbox';
import ConfirmDialog from '../ui/ConfirmDialog';

import styles from './SensitiveContentConfirmModal.module.scss';

type OwnProps = {
  isOpen: boolean;
  onClose: NoneToVoidFunction;
  shouldAlwaysShow: boolean;
  onAlwaysShowChanged: (value: boolean) => void;
  confirmHandler: NoneToVoidFunction;
};

type StateProps = {
  verifyAgeMin: number;
};

const SensitiveContentConfirmModal = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const lang = useLang();

  return (
    <ConfirmDialog
      title={lang('TitleSensitiveModal', { years: props.verifyAgeMin })}
      confirmLabel={lang('ButtonSensitiveView')}
      isOpen={props.isOpen}
      onClose={props.onClose}
      confirmHandler={props.confirmHandler}
    >
      {lang('TextSensitiveModal')}
      <Checkbox
        className={styles.checkBox}
        label={lang('ButtonSensitiveAlways', { years: props.verifyAgeMin })}
        checked={props.shouldAlwaysShow}
        onCheck={props.onAlwaysShowChanged}
      />
    </ConfirmDialog>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
  const appConfig = global.appConfig;
  const verifyAgeMin = appConfig.verifyAgeMin;

  return {
    verifyAgeMin: verifyAgeMin || VERIFY_AGE_MIN_DEFAULT,
  };
};

export default SensitiveContentConfirmModal;
