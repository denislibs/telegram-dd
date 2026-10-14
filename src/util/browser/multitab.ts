// FOUNDATION STUB (types only): the multitab runtime (global-state sync) is ported with the app layer.
// Source: telegram-tt src/util/browser/multitab.ts; the message types below are copied verbatim.

import type { LocalDb } from '../../api/gramjs/localDb';
import type { MethodArgs, Methods } from '../../api/gramjs/methods/types';
import type { ApiInitialArgs } from '../../api/types';
import type { GlobalState } from '../../global/types';

type BroadcastChannelRefreshLangpack = {
  type: 'langpackRefresh';
  langCode: string;
};

type BroadcastChannelRequestGlobal = {
  type: 'requestGlobal';
  token?: number;
  appVersion: string;
};

type BroadcastChannelGlobalUpdate = {
  type: 'globalUpdate';
  global: GlobalState;
};

type BroadcastChannelCancelApiProgress = {
  type: 'cancelApiProgress';
  token: number;
  messageId: string;
};

type BroadcastChannelCallApi = {
  type: 'callApi';
  token: number;
  messageId: string;
  name: keyof Methods;
  args: MethodArgs<keyof Methods>;
  withCallback?: boolean;
};

type BroadcastChannelMessageResponse = {
  type: 'messageResponse';
  token: number;
  messageId: string;
  response: any;
};

type BroadcastChannelLocalDbUpdate = {
  type: 'localDbUpdate';
  batchedUpdates: {
    name: keyof LocalDb;
    prop: string;
    value: any;
  }[];
};

type BroadcastChannelLocalDbUpdateFull = {
  type: 'localDbUpdateFull';
  localDb: any;
};

type BroadcastChannelMessageCallback = {
  type: 'messageCallback';
  token: number;
  messageId: string;
  callbackArgs: any;
};

type BroadcastChannelGlobalDiff = {
  type: 'globalDiffUpdate';
  diff: any;
};

type BroadcastChannelInitApi = {
  type: 'initApi';
  token: number;
  initialArgs: ApiInitialArgs;
};

export type TypedBroadcastChannel = {
  postMessage: (message: BroadcastChannelMessage) => void;
  addEventListener: (type: 'message', listener: (event: { data: BroadcastChannelMessage }) => void) => void;
  removeEventListener: (type: 'message', listener: (event: { data: BroadcastChannelMessage }) => void) => void;
};

type BroadcastChannelMessage =
  | BroadcastChannelRequestGlobal
  | BroadcastChannelGlobalUpdate
  | BroadcastChannelCallApi
  | BroadcastChannelMessageResponse
  | BroadcastChannelRefreshLangpack
  | BroadcastChannelMessageCallback
  | BroadcastChannelCancelApiProgress
  | BroadcastChannelLocalDbUpdate
  | BroadcastChannelLocalDbUpdateFull
  | BroadcastChannelGlobalDiff
  | BroadcastChannelInitApi;
