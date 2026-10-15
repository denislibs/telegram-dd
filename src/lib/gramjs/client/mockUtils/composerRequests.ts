// Original file (not in telegram-tt). The requests of the composer under the mocked client: sending, editing, drafts and
// the typing status. tt's mock answers none of them (a sent message stays "pending" forever); this one stores the message in
// the scenario's chat and answers like the server does, so that the composer can be driven end to end by the e2e gates.
import type TelegramClient from '../MockClient';

import Api from '../../tl/api';
import createMockedMessage from './createMockedMessage';
import getIdFromInputPeer from './getIdFromInputPeer';

export const PASS = 'pass';

const nowSeconds = () => Math.floor(Date.now() / 1000);

function getReplyToMsgId(replyTo?: Api.TypeInputReplyTo) {
  return replyTo instanceof Api.InputReplyToMessage ? replyTo.replyToMsgId : undefined;
}

export default function handleComposerRequest<A, R>(mockClient: TelegramClient, request: Api.Request<A, R>) {
  if (request instanceof Api.messages.SendMessage) {
    const peerId = getIdFromInputPeer(request.peer);
    const list = (mockClient.mockData.messages[peerId] ||= []);
    const id = Math.max(0, ...list.map((message) => message.id)) + 1;
    const date = nowSeconds();
    const replyToMsgId = getReplyToMsgId(request.replyTo);

    list.push({
      id,
      date,
      message: request.message,
      out: true,
      entities: request.entities || [],
      ...(replyToMsgId && { replyTo: new Api.MessageReplyHeader({ replyToMsgId }) }),
    });
    const dialog = mockClient.mockData.dialogs.active.find((l) => l.id === peerId);
    if (dialog) dialog.topMessage = id;

    return new Api.UpdateShortSentMessage({
      out: true,
      id,
      pts: id,
      ptsCount: 1,
      date,
      entities: request.entities,
    });
  }

  if (request instanceof Api.messages.EditMessage) {
    const peerId = getIdFromInputPeer(request.peer);
    const message = mockClient.mockData.messages[peerId]?.find((l) => l.id === request.id);
    if (!message) return undefined;

    if (request.message !== undefined) message.message = request.message;
    message.entities = request.entities || [];
    message.editDate = nowSeconds();

    return new Api.Updates({
      updates: [new Api.UpdateEditMessage({
        message: createMockedMessage(peerId, request.id, mockClient.mockData),
        pts: request.id,
        ptsCount: 1,
      })],
      users: [],
      chats: [],
      date: nowSeconds(),
      seq: 0,
    });
  }

  if (request instanceof Api.messages.SaveDraft) {
    return true;
  }

  if (request instanceof Api.messages.SetTyping) {
    return true;
  }

  return PASS;
}
