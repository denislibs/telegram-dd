import { createMemo } from 'frameact';

import type { GlobalState } from '../global/types';
import type { LangFn } from '../util/localization';

import { type MaybeAccessor, read } from '../util/accessors';
import useBrowserOnline from './window/useBrowserOnline';

export enum ConnectionStatus {
  waitingForNetwork,
  syncing,
  online,
}

type ConnectionStatusPosition = 'overlay' | 'minimized' | 'middleHeader' | 'none';

// Deviation: a hook runs once, so the reactive parameters are `MaybeAccessor`s and the three results are accessors.
export default function useConnectionStatus(
  lang: LangFn,
  connectionState: MaybeAccessor<GlobalState['connectionState']>,
  isSyncing: MaybeAccessor<boolean | undefined>,
  hasMiddleHeader: MaybeAccessor<boolean>,
  isMinimized?: MaybeAccessor<boolean | undefined>,
  isDisabled?: MaybeAccessor<boolean | undefined>,
) {
  const isBrowserOnline = useBrowserOnline();

  const status = createMemo(() => {
    if (!isBrowserOnline() || read(connectionState) === 'connectionStateConnecting') {
      return ConnectionStatus.waitingForNetwork;
    } else if (read(isSyncing)) {
      return ConnectionStatus.syncing;
    } else {
      return ConnectionStatus.online;
    }
  });

  const position = createMemo((): ConnectionStatusPosition => {
    if (status() === ConnectionStatus.online || read(isDisabled)) {
      return 'none';
    } else if (read(hasMiddleHeader)) {
      return 'middleHeader';
    } else if (read(isMinimized)) {
      return 'minimized';
    } else {
      return 'overlay';
    }
  });

  const text = createMemo(() => {
    let result: string | undefined;
    if (status() === ConnectionStatus.waitingForNetwork) {
      result = lang('WaitingForNetwork');
    } else if (status() === ConnectionStatus.syncing) {
      result = lang('Updating');
    }

    if (position() === 'middleHeader') {
      result = result!.toLowerCase().replace(/\.+$/, '');
    }

    return result;
  });

  return {
    connectionStatus: status,
    connectionStatusPosition: position,
    connectionStatusText: text,
  };
}
