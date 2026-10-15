// FOUNDATION STUB: InlineButtons (telegram-tt src/components/middle/message/InlineButtons.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import { For } from 'frameact/dom';

import type { ApiKeyboardButton } from '../../../api/types';

import { clampCount, PLACEHOLDER_RADIUS } from '../../common/helpers/placeholder';

export type OwnProps = {
  className?: string;
  inlineButtons: ApiKeyboardButton[][];
  isEphemeral?: boolean;
  isReceipt?: boolean;
  onClick: (payload: ApiKeyboardButton) => void;
};

// Telegram keyboards have up to 100 buttons: only the shape (rows and buttons per row) is drawn, the texts are not.
const MAX_ROWS = 20;
const MAX_BUTTONS_IN_ROW = 8;
const BUTTON_HEIGHT_REM = 2;

// TODO(port): the real InlineButtons (button texts and icons, URL / callback / payment actions).
const InlineButtons = (props: OwnProps) => {
  const rows = () => Array.from({ length: clampCount(props.inlineButtons.length, MAX_ROWS) }, (_, i) => i);
  const buttonsInRow = (rowIndex: number) =>
    Array.from({ length: clampCount(props.inlineButtons[rowIndex]?.length, MAX_BUTTONS_IN_ROW) }, (_, i) => i);

  return (
    <div
      role="group"
      aria-label="Buttons, not supported yet"
      class={props.className}
      style="display: flex; flex-direction: column; max-width: var(--max-width)"
    >
      <For each={rows()}>
        {(rowIndex) => (
          <div style="display: flex">
            <For each={buttonsInRow(rowIndex)}>
              {() => (
                <div
                  style={`flex: 1; height: ${BUTTON_HEIGHT_REM}rem; margin: 0.125rem; background: var(--action-message-bg); ${PLACEHOLDER_RADIUS}`}
                />
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
};

export default InlineButtons;
