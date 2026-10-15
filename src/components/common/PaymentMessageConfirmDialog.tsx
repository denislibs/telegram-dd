import { createMemo } from 'frameact';

import { formatStarsAsText } from '../../util/localization/format';

import useLang from '../../hooks/useLang';

import Checkbox from '../ui/Checkbox';
import ConfirmDialog from '../ui/ConfirmDialog';

import styles from './PaymentMessageConfirmDialog.module.scss';

type OwnProps = {
  isOpen: boolean;
  onClose: NoneToVoidFunction;
  userName?: string;
  messagePriceInStars: number;
  messagesCount: number;
  shouldAutoApprove: boolean;
  setAutoApprove: StateHookSetter<boolean>;
  confirmHandler: NoneToVoidFunction;
};

const PaymentMessageConfirmDialog = (props: OwnProps) => {
  const lang = useLang();

  const confirmPaymentMessage = createMemo(() =>
    lang(
      'ConfirmationModalPaymentForMessage',
      {
        user: props.userName,
        amount: formatStarsAsText(lang, props.messagePriceInStars),
        totalAmount: formatStarsAsText(lang, props.messagePriceInStars * props.messagesCount),
        count: props.messagesCount,
      },
      {
        withMarkdown: true,
        withNodes: true,
        pluralValue: props.messagesCount,
      },
    ),
  );

  const confirmLabel = createMemo(() =>
    lang(
      'PayForMessage',
      { count: props.messagesCount },
      {
        withNodes: true,
        pluralValue: props.messagesCount,
      },
    ),
  );

  return (
    <ConfirmDialog
      title={lang('TitleConfirmPayment')}
      confirmLabel={confirmLabel()}
      isOpen={props.isOpen}
      onClose={props.onClose}
      confirmHandler={props.confirmHandler}
    >
      {confirmPaymentMessage()}
      <Checkbox
        className={styles.checkBox}
        label={lang('DoNotAskAgain')}
        checked={props.shouldAutoApprove}
        onCheck={props.setAutoApprove}
      />
    </ConfirmDialog>
  );
};

export default PaymentMessageConfirmDialog;
