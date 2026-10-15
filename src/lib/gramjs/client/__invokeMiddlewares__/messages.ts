// Original file (not in telegram-tt). Request handlers of the `messages` mock scenario (middle column gates): the default
// mock answers every GetHistory with the whole chat and every GetDialogs with every message of every chat; this pages
// the history like the server does (offsetId / addOffset / limit / maxId / minId, newest first) and sends only the top
// message of each dialog.
import type TelegramClient from '../MockClient';

import Api from '../../tl/api';
import createMockedMessage from '../mockUtils/createMockedMessage';
import getIdFromInputPeer from '../mockUtils/getIdFromInputPeer';

export default function<A, R>(mockClient: TelegramClient, request: Api.Request<A, R>) {
  if (request instanceof Api.messages.GetDialogs) {
    if (request.folderId || !(request.offsetPeer instanceof Api.InputPeerEmpty)) {
      return new Api.messages.Dialogs({ dialogs: [], users: [], chats: [], messages: [] });
    }

    const dialogs = mockClient.getDialogs();
    return new Api.messages.Dialogs({
      dialogs,
      messages: mockClient.mockData.dialogs.active.map(({ id, topMessage }) => (
        createMockedMessage(id, topMessage!, mockClient.mockData)
      )),
      chats: [],
      users: mockClient.mockData.users.map(({ id }) => mockClient.getUser(id)),
    });
  }

  if (request instanceof Api.messages.GetHistory) {
    const peerId = getIdFromInputPeer(request.peer);
    const all = (mockClient.mockData.messages[peerId] || []).map(({ id }) => id).sort((a, b) => b - a);

    let ids = all;
    if (request.maxId) ids = ids.filter((id) => id < request.maxId);
    if (request.minId) ids = ids.filter((id) => id > request.minId);

    // The first `position` messages are the ones at or after the offset message: a negative addOffset reaches back to them
    const position = request.offsetId ? ids.filter((id) => id >= request.offsetId).length : 0;
    const start = Math.max(0, position + (request.addOffset || 0));
    const page = ids.slice(start, start + request.limit);

    return new Api.messages.MessagesSlice({
      messages: page.map((id) => createMockedMessage(peerId, id, mockClient.mockData)),
      count: all.length,
      chats: [],
      users: [],
      topics: [],
    });
  }

  return 'pass';
}
