// Original file (not in telegram-tt). Request handlers of the `messages` mock scenario (middle column gates): the default
// mock answers every GetHistory with the whole chat and every GetDialogs with every message of every chat; this pages
// the history like the server does (offsetId / addOffset / limit / maxId / minId, newest first) and sends only the top
// message of each dialog.
import type TelegramClient from '../MockClient';

import Api from '../../tl/api';
import createMockedChannel from '../mockUtils/createMockedChannel';
import createMockedMessage from '../mockUtils/createMockedMessage';
import getIdFromInputPeer from '../mockUtils/getIdFromInputPeer';

// The text entities of chat 8: a mock message is built from JSON, which cannot hold the entity classes.
function entitiesOf(message: Api.Message) {
  const at = (word: string) => {
    const offset = message.message.indexOf(word);
    return { offset, length: word.length };
  };
  switch (message.id) {
    case 3001:
      return [
        new Api.MessageEntityBold(at('Bold')),
        new Api.MessageEntityItalic(at('italic')),
        new Api.MessageEntityUnderline(at('underline')),
        new Api.MessageEntityStrike(at('strike')),
        new Api.MessageEntityCode(at('monospace')),
      ];
    case 3002:
      return [
        new Api.MessageEntityTextUrl({ ...at('label'), url: 'https://example.org/label' }),
        new Api.MessageEntityUrl(at('https://example.com/path')),
        new Api.MessageEntityHashtag(at('#hashtag')),
        new Api.MessageEntityCashtag(at('$CASH')),
        new Api.MessageEntityBotCommand(at('/command')),
        new Api.MessageEntityEmail(at('user@example.com')),
        new Api.MessageEntityPhone(at('+1 555 0100')),
      ];
    case 3003:
      return [
        new Api.MessageEntitySpoiler(at('secret words')),
        new Api.MessageEntityBlockquote(at('first line of the quote\nsecond line of the quote')),
        new Api.MessageEntityPre({ ...at('const a = 1;'), language: '' }),
      ];
    default:
      return undefined;
  }
}

// What a mock message cannot hold in its JSON (a class instance, a bigint): the sender, the forward header, the album id and
// the service action are written as plain fields and built here.
type ScenarioMessage = {
  fromUserId?: string;
  fwdFromUserId?: string;
  fwdFromName?: string;
  groupedId?: string;
  service?: 'addUser';
  serviceUserId?: string;
};

function createMessage(mockClient: TelegramClient, peerId: string, id: number): Api.Message | Api.MessageService {
  const message = createMockedMessage(peerId, id, mockClient.mockData);
  const entities = peerId === '8' ? entitiesOf(message) : undefined;
  if (entities) message.entities = entities;

  const raw = mockClient.mockData.messages[peerId].find((item) => item.id === id) as ScenarioMessage | undefined;
  if (!raw) return message;

  const fromId = raw.fromUserId ? new Api.PeerUser({ userId: BigInt(raw.fromUserId) }) : undefined;
  if (raw.service === 'addUser') {
    return new Api.MessageService({
      id,
      peerId: message.peerId,
      fromId,
      date: message.date,
      action: new Api.MessageActionChatAddUser({ users: [BigInt(raw.serviceUserId!)] }),
    });
  }

  if (fromId) message.fromId = fromId;
  if (raw.groupedId) message.groupedId = BigInt(raw.groupedId);
  if (raw.fwdFromUserId || raw.fwdFromName) {
    message.fwdFrom = new Api.MessageFwdHeader({
      date: message.date - 3600,
      fromId: raw.fwdFromUserId ? new Api.PeerUser({ userId: BigInt(raw.fwdFromUserId) }) : undefined,
      fromName: raw.fwdFromUserId ? undefined : raw.fwdFromName,
    });
  }

  return message;
}

export default function<A, R>(mockClient: TelegramClient, request: Api.Request<A, R>) {
  if (request instanceof Api.messages.GetDialogs) {
    if (request.folderId || !(request.offsetPeer instanceof Api.InputPeerEmpty)) {
      return new Api.messages.Dialogs({ dialogs: [], users: [], chats: [], messages: [] });
    }

    const dialogs = mockClient.getDialogs();
    return new Api.messages.Dialogs({
      dialogs,
      messages: mockClient.mockData.dialogs.active.map(({ id, topMessage }) => (
        createMessage(mockClient, id, topMessage!)
      )),
      chats: mockClient.mockData.channels.map(({ id }) => createMockedChannel(id, mockClient.mockData)),
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
      messages: page.map((id) => createMessage(mockClient, peerId, id)),
      count: all.length,
      chats: [],
      users: [],
      topics: [],
    });
  }

  return 'pass';
}
