// FOUNDATION STUB: Game (telegram-tt src/components/middle/message/Game.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ApiMessage } from '../../../api/types';
import type { ThreadId } from '../../../types';

export type OwnProps = {
  message: ApiMessage;
  threadId?: ThreadId;
  canAutoLoadMedia?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Game = (_props: OwnProps) => undefined;

export default Game;
