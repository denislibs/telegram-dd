// The large mock scenario of the performance comparison, generated (not committed) and written into the build tree of
// each app just before its build, so both apps get byte-identical data and `tests/visual/mocks.spec.ts` (which compares
// the committed scenarios with tt's) never sees it. Format: tt's MockClient JSON (`MockTypes`).
//
// Groups and channels get `date` = their last message date: tt orders by max(creation date, last message date), and
// the mock's default creation date (BASE_DATE) would otherwise float every group and channel above every user chat.
// Chats are listed newest first: rank 0 has the newest last message. Kinds repeat as user, user, group, user, user,
// channel, so the first screen holds all three. Ids never collide (users 1001.., groups 30001.., channels 50001..).
// The ids the APP uses for them (channels get another form) are read from its state at run time, in list order.

export const LARGE_SCENARIO_NAME = 'perfcmp-large';
export const DEFAULT_CHAT_COUNT = 1200;

/** First message date of the mock (tt's MOCK_STARTING_DATE): new messages must be newer than every listed chat. */
export const BASE_DATE = 1_666_969_420;

export type ChatKind = 'user' | 'group' | 'channel';

export interface ChatInfo {
  rank: number;
  kind: ChatKind;
  /** Id used inside the mock JSON. */
  mockId: string;
  topMessageId: number;
}

export interface LargeScenario {
  /** JSON for `__mocks__/<LARGE_SCENARIO_NAME>.json`. */
  json: Record<string, unknown>;
  chats: ChatInfo[];
  /** Titles of the custom chat folders, in tab order after "All chats". */
  folders: string[];
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Alex', 'Maria', 'John', 'Olga', 'Ivan', 'Anna', 'Peter', 'Julia', 'Max', 'Eva', 'Leo', 'Nina'];
const LAST = ['Smith', 'Ivanova', 'Brown', 'Petrov', 'Garcia', 'Kim', 'Novak', 'Rossi', 'Muller', 'Sato', 'Dubois'];
const TOPICS = ['Design', 'Release', 'Weekend', 'Frontend', 'Team', 'Travel', 'Music', 'Gaming', 'Cooking', 'News'];
const WORDS = [
  'ok',
  'see you',
  'thanks',
  'let us meet tomorrow',
  'the build is green',
  'can you check the latest design?',
  'sent the files',
  'lunch?',
  'happy birthday',
  'on my way',
  'did you read the update about the release schedule and the open questions',
  'sounds good',
];

// tt's folder builder reads `title` as a TextWithEntities (the committed scenarios predate that), a plain object is enough.
const text = (value: string) => ({ text: value, entities: [] });

export function buildLargeScenario(chatCount = DEFAULT_CHAT_COUNT, seed = 20261014): LargeScenario {
  const random = mulberry32(seed);
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];

  const users: Record<string, unknown>[] = [{ id: '1', self: true, firstName: 'Me', lastName: 'Myself' }];
  const chats: Record<string, unknown>[] = [];
  const channels: Record<string, unknown>[] = [];
  const dialogs: Record<string, unknown>[] = [];
  const messages: Record<string, Record<string, unknown>[]> = {};
  const infos: ChatInfo[] = [];
  const contactPeerIds: string[] = [];

  for (let rank = 0; rank < chatCount; rank++) {
    const slot = rank % 6;
    const kind: ChatKind = slot === 5 ? 'channel' : slot === 2 ? 'group' : 'user';
    const messageId = rank + 1;
    const date = BASE_DATE - rank * 61;
    const unreadCount = rank % 4 === 1 ? 1 + (rank % 9) : 0;
    let mockId: string;

    if (kind === 'user') {
      mockId = String(1001 + rank);
      users.push({
        id: mockId,
        firstName: pick(FIRST),
        lastName: pick(LAST),
        contact: rank % 3 !== 0,
        mutualContact: rank % 3 !== 0,
      });
      if (rank % 15 === 0) contactPeerIds.push(mockId);
    } else if (kind === 'group') {
      mockId = String(30001 + rank);
      chats.push({ id: mockId, title: `${pick(TOPICS)} group ${rank}`, participantsCount: 5 + (rank % 40), date });
    } else {
      mockId = String(50001 + rank);
      channels.push({ id: mockId, title: `${pick(TOPICS)} channel ${rank}`, broadcast: true, date });
    }

    dialogs.push({ id: mockId, topMessage: messageId, unreadCount, readInboxMaxId: unreadCount ? 0 : messageId });
    messages[mockId] = [{ id: messageId, date, message: `${pick(WORDS)} #${rank}`, entities: [] }];
    infos.push({ rank, kind, mockId, topMessageId: messageId });
  }

  const json = {
    users,
    chats,
    channels,
    dialogs: { active: dialogs, archived: [] },
    messages,
    availableReactions: [],
    documents: [],
    topPeers: [],
    dialogFilters: [
      { id: 2, title: text('Personal'), contacts: true, nonContacts: true },
      { id: 3, title: text('Groups'), groups: true },
      { id: 4, title: text('Channels'), broadcasts: true },
      { id: 5, title: text('Favourites'), includePeerIds: contactPeerIds.slice(0, 40) },
    ],
  };
  return { json, chats: infos, folders: ['Personal', 'Groups', 'Channels', 'Favourites'] };
}
