// Original file (not in telegram-tt). Generates src/lib/gramjs/client/__mocks__/messages.json: the mocked scenario of the
// middle column (messages slice) e2e/visual/leak gates. `pnpm exec tsx scripts/mock/generateMessagesScenario.ts`.
//
//   chat 5 "Alice Tester": 300 messages over ~37 days (8 a day, so date separators appear while scrolling), lines of
//                          different heights, every third message outgoing; messages 251..300 are unread (first unread: 251,
//                          33 of them are incoming: that is the unread count, as the server counts it)
//   chat 6 "Bob Reader":   60 short messages, all read (the second chat: "switching chats keeps the scroll position")
//   chat 7 "Carol Short":  3 messages, all read (fits the viewport: no scrolling, no history to load)
//   chat 8 "Dave Entities": 4 messages with text entities (their text is here, the entities are added by the middleware: the
//                          JSON of a mock cannot hold the entity classes), all read
//   channel -1000000000009 "Team Chat":  a supergroup: several senders (Alice, Bob, Eve, Frank, me) with consecutive messages (sender
//                          groups with avatars and names), a service message (Bob added Eve), messages forwarded from a
//                          user and from a hidden name, an album of three photos (stub media, with a caption), a second day
//                          (a date separator), a reply; the middleware builds what JSON cannot hold: `fromUserId` -> the
//                          sender, `fwdFromUserId` / `fwdFromName` -> the forward header, `service` -> a service message,
//                          `groupedId` -> an album id
//   channel -1000000000010 "Daily News": a broadcast channel: posts with views and forwards, one forwarded from a hidden name, one edited
//
// The mock's GetHistory ignores offsets; `__invokeMiddlewares__/messages.ts` pages it like the server does.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_DATE = 1_700_000_000; // 2023-11-14T22:13:20Z
const DAY = 24 * 3600;

const LOREM = 'lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore';

function aliceMessage(id: number) {
  let text = `Alice message ${id}`;
  if (id % 4 === 0) text += `\nsecond line of ${id}`;
  if (id % 9 === 0) text += ` ${LOREM} ${LOREM}`;
  if (id % 17 === 0) text += `\nthird\nfourth\nfifth line of ${id}`;
  return {
    id,
    // 8 messages a day, 3 hours apart, starting at 06:00 UTC: the first message of a day starts a new date group
    date: BASE_DATE + Math.floor((id - 1) / 8) * DAY + ((id - 1) % 8) * 3 * 3600,
    message: text,
    out: id % 3 === 0,
    entities: [],
  };
}

const messages: Record<string, unknown[]> = {
  '5': Array.from({ length: 300 }, (_, i) => aliceMessage(i + 1)),
  '6': Array.from({ length: 60 }, (_, i) => ({
    id: 1000 + i + 1,
    date: BASE_DATE + 40 * DAY + i * 600,
    message: `Bob message ${i + 1}`,
    out: (i + 1) % 4 === 0,
    entities: [],
  })),
  '7': [
    { id: 2001, date: BASE_DATE + 41 * DAY, message: 'Carol one', entities: [] },
    { id: 2002, date: BASE_DATE + 41 * DAY + 60, message: 'Carol two', out: true, entities: [] },
    { id: 2003, date: BASE_DATE + 41 * DAY + 120, message: 'Carol three', entities: [] },
  ],
};

const ENTITY_TEXTS = [
  'Bold, italic, underline, strike and monospace text',
  'Links: label, https://example.com/path, #hashtag, $CASH, /command, user@example.com, +1 555 0100',
  'Spoiler: secret words\nQuote: first line of the quote\nsecond line of the quote\ncode:\nconst a = 1;',
  `A long paragraph, so that the bubble wraps: ${LOREM} ${LOREM} ${LOREM}`,
];
messages['8'] = ENTITY_TEXTS.map((message, i) => ({
  id: 3001 + i,
  date: BASE_DATE + 42 * DAY + i * 60,
  message,
  out: i === 3,
  entities: [],
}));

// The mock builds the id of a channel as `-id - 10^12`, and the app takes it from the Channel as `-(id + 10^12)`: a channel
// that is to have a negative chat id (a group is not a user) is written here by that id
const GROUP_ID = '-1000000000009';
const NEWS_ID = '-1000000000010';
const GROUP_DATE = BASE_DATE + 43 * DAY;
messages[GROUP_ID] = [
  // the album comes first: the bottom of the history (where the chat opens) is plain text, which telegram-tt renders the same
  // way (the stub of the media is not telegram-tt's media: the visual screen of the group must not show it)
  {
    id: 4001,
    date: GROUP_DATE,
    message: 'Album caption',
    fromUserId: '6',
    groupedId: '777',
    media: { type: 'photo', id: 1 },
  },
  { id: 4002, date: GROUP_DATE + 1, message: '', fromUserId: '6', groupedId: '777', media: { type: 'photo', id: 1 } },
  { id: 4003, date: GROUP_DATE + 2, message: '', fromUserId: '6', groupedId: '777', media: { type: 'photo', id: 1 } },
  { id: 4004, date: GROUP_DATE + 60, message: 'Morning team', fromUserId: '5' },
  { id: 4005, date: GROUP_DATE + 120, message: 'Standup in five minutes', fromUserId: '5' },
  { id: 4006, date: GROUP_DATE + 180, message: 'On my way', fromUserId: '6' },
  { id: 4007, date: GROUP_DATE + 240, message: 'See you there', fromUserId: '1', out: true },
  { id: 4008, date: GROUP_DATE + 300, service: 'addUser', fromUserId: '6', serviceUserId: '11' },
  { id: 4009, date: GROUP_DATE + 360, message: `Hello everyone, glad to be here. ${LOREM}`, fromUserId: '11' },
  { id: 4010, date: GROUP_DATE + 420, message: 'Forwarded note', fromUserId: '5', fwdFromUserId: '12' },
  {
    id: 4011,
    date: GROUP_DATE + 480,
    message: 'Forwarded from a hidden sender',
    fromUserId: '5',
    fwdFromName: 'Anonymous Source',
  },
  { id: 4012, date: GROUP_DATE + DAY, message: 'Next day message', fromUserId: '12' },
  {
    id: 4013,
    date: GROUP_DATE + DAY + 60,
    message: 'Answering the standup note',
    fromUserId: '11',
    replyToMsgId: 4006,
  },
  { id: 4014, date: GROUP_DATE + DAY + 120, message: 'Thanks for the note', fromUserId: '12' },
  { id: 4015, date: GROUP_DATE + DAY + 180, message: 'Anytime', fromUserId: '11' },
  { id: 4016, date: GROUP_DATE + DAY + 240, message: 'One more thing', fromUserId: '11' },
];
messages[NEWS_ID] = [
  { id: 5001, date: GROUP_DATE + 10, message: 'Daily News: the first post', post: true, views: 1200, forwards: 14 },
  { id: 5002, date: GROUP_DATE + 20, message: `The second post is longer. ${LOREM}`, post: true, views: 980 },
  {
    id: 5003,
    date: GROUP_DATE + 30,
    message: 'A forwarded post',
    post: true,
    views: 640,
    fwdFromName: 'Other Channel',
  },
  { id: 5004, date: GROUP_DATE + 40, message: 'An edited post', post: true, views: 300, editDate: GROUP_DATE + 100 },
];

// (a mock message gets a mention entity at its start unless it says otherwise)
for (const id of [GROUP_ID, NEWS_ID]) {
  messages[id] = messages[id].map((message) => ({ ...(message as object), entities: [] }));
}

const json = {
  users: [
    { id: '1', self: true, firstName: 'Me', lastName: 'Myself' },
    { id: '5', firstName: 'Alice', lastName: 'Tester' },
    { id: '6', firstName: 'Bob', lastName: 'Reader' },
    { id: '7', firstName: 'Carol', lastName: 'Short' },
    { id: '8', firstName: 'Dave', lastName: 'Entities' },
    { id: '11', firstName: 'Eve', lastName: 'Newcomer' },
    { id: '12', firstName: 'Frank', lastName: 'Source' },
  ],
  chats: [],
  channels: [
    { id: GROUP_ID, title: 'Team Chat', megagroup: true, participantsCount: 5 },
    { id: NEWS_ID, title: 'Daily News', broadcast: true, participantsCount: 5000 },
  ],
  dialogs: {
    active: [
      { id: NEWS_ID, topMessage: 5004, readInboxMaxId: 5004, unreadCount: 0 },
      { id: GROUP_ID, topMessage: 4016, readInboxMaxId: 4016, unreadCount: 0 },
      { id: '8', topMessage: 3004, readInboxMaxId: 3004, unreadCount: 0 },
      { id: '7', topMessage: 2003, readInboxMaxId: 2003, unreadCount: 0 },
      { id: '6', topMessage: 1060, readInboxMaxId: 1060, unreadCount: 0 },
      { id: '5', topMessage: 300, readInboxMaxId: 250, unreadCount: 33 },
    ],
    archived: [],
  },
  messages,
  availableReactions: [],
  documents: [{ id: 1, url: 'lock.png', mimeType: 'image/png' }],
  dialogFilters: [],
  topPeers: [],
};

writeFileSync(
  resolve(import.meta.dirname, '../../src/lib/gramjs/client/__mocks__/messages.json'),
  `${JSON.stringify(json, undefined, 2)}\n`,
);
