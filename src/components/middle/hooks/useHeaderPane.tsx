// FOUNDATION STUB: useHeaderPane (telegram-tt src/components/middle/hooks/useHeaderPane.tsx) is ported with the header panes
// (pinned message, audio player, group call) in a later slice. Only the pane state type the middle column and the audio
// player stub refer to is kept.
export interface PaneState {
  element?: HTMLElement;
  height: number;
  isOpen?: boolean;
  isSpacer?: boolean;
  isPending?: boolean;
  key?: string;
}

export const PANE_GAP_REM = 0.5;
