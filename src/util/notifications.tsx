// FOUNDATION STUB: web push and desktop notifications. The module renders message summaries through a component
// (`MessageSummary` -> `jsxToHtml`), so it is ported with the components (T6). Until then every function is a no-op:
// the global layer (login/logout, settings, apiUpdaters) calls them and keeps working without notifications.
// Copied (signatures) from telegram-tt src/util/notifications.tsx
import type { ApiChat, ApiMessage, ApiPhoneCall, ApiUser } from '../api/types';

export function requestPermission(): Promise<boolean> {
  return Promise.resolve(false);
}

export function subscribe() {
  return Promise.resolve();
}

export function unsubscribe() {
  return Promise.resolve();
}

export function unsubscribeLocally() {
  return Promise.resolve();
}

export function notifyAboutCall(_params: { call: ApiPhoneCall; user: ApiUser }) {
  return Promise.resolve();
}

export function notifyAboutMessage(_params: { chat: ApiChat; message: Partial<ApiMessage>; isReaction?: boolean }) {
  return Promise.resolve();
}

export function closeMessageNotifications(_payload: { chatId: string; lastReadInboxMessageId?: number }) {}
