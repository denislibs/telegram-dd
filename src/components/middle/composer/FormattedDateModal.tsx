// FOUNDATION STUB: FormattedDateModal (telegram-tt src/components/middle/composer/FormattedDateModal.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiFormattedText } from '../../../api/types';
import type { FormattedDateEntityOptions } from '../../../util/dates/formattedDate';

export type OwnProps = {
  isOpen: boolean;
  initialDate?: number;
  initialOptions?: FormattedDateEntityOptions;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd?: NoneToVoidFunction;
  onSubmit: (text: ApiFormattedText) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FormattedDateModal = (_props: OwnProps) => undefined;

export default FormattedDateModal;
