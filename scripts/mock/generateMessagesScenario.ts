// Original file (not in telegram-tt). Generates src/lib/gramjs/client/__mocks__/messages.json: the mocked scenario of the
// middle column (messages slice) e2e/visual/leak gates. `pnpm exec tsx scripts/mock/generateMessagesScenario.ts`.
//
//   chat 5 "Alice Tester": 300 messages over ~37 days (8 a day, so date separators appear while scrolling), lines of
//                          different heights, every third message outgoing; the last 50 are unread (first unread: 251)
//   chat 6 "Bob Reader":   60 short messages, all read (the second chat: "switching chats keeps the scroll position")
//   chat 7 "Carol Short":  3 messages, all read (fits the viewport: no scrolling, no history to load)
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

const json = {
  users: [
    { id: '1', self: true, firstName: 'Me', lastName: 'Myself' },
    { id: '5', firstName: 'Alice', lastName: 'Tester' },
    { id: '6', firstName: 'Bob', lastName: 'Reader' },
    { id: '7', firstName: 'Carol', lastName: 'Short' },
  ],
  chats: [],
  channels: [],
  dialogs: {
    active: [
      { id: '7', topMessage: 2003, readInboxMaxId: 2003, unreadCount: 0 },
      { id: '6', topMessage: 1060, readInboxMaxId: 1060, unreadCount: 0 },
      { id: '5', topMessage: 300, readInboxMaxId: 250, unreadCount: 50 },
    ],
    archived: [],
  },
  messages,
  availableReactions: [],
  documents: [],
  dialogFilters: [],
  topPeers: [],
};

writeFileSync(
  resolve(import.meta.dirname, '../../src/lib/gramjs/client/__mocks__/messages.json'),
  `${JSON.stringify(json, undefined, 2)}\n`,
);
