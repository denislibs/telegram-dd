// FOUNDATION STUB: BotCommandMenu.async (telegram-tt src/components/middle/composer/BotCommandMenu.async.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
// Deviation: the sync BotCommandMenu is not in src yet, so its OwnProps are copied here and exported from this file.
import type { ApiBotCommand } from '../../../api/types';

export type OwnProps = {
  isOpen: boolean;
  botCommands: ApiBotCommand[];
  onClose: NoneToVoidFunction;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BotCommandMenuAsync = (_props: OwnProps) => undefined;

export default BotCommandMenuAsync;
