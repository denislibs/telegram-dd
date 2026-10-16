// The scenarios of the comparison. Each one is the same user-visible action in both apps, driven from inside the page
// (probe.js) so the numbers contain the app's own work and nothing of Playwright's round trips.
//
// A scenario declares what it needs from an app (`needs`): an app that lacks it (our chat list is still being ported) is
// reported "n/a" for that scenario instead of failing, and the comparison starts working by itself once it lands.
import type { Page } from '@playwright/test';

/** What an app offers, found by `preflight()` in the runner. */
export interface Capabilities {
  /** `#Main` is rendered (the logged-in shell). */
  shell: boolean;
  /** The chat list rows are rendered from the mocked dialogs. */
  chatList: boolean;
  /** At least two folder tabs are rendered. */
  folders: boolean;
  /** `window.getActions().apiUpdate` is exposed (the update injection hook). */
  inject: boolean;
}

export type Need = keyof Capabilities;

export interface ScenarioContext {
  page: Page;
}

export interface ScenarioOutput {
  /** Page time (performance.now) at which a blocking animation ended; enables the "after release" metrics. */
  animationEnd?: number;
  /** Page time at which the scenario's second phase starts (typing: the first keystroke); splits the window metrics. */
  splitAt?: number;
  /** Extra metrics the scenario measured itself. */
  extra?: Record<string, number>;
}

export interface Scenario {
  id: string;
  title: string;
  /** What is measured, for the report. */
  description: string;
  needs: Need[];
  /**
   * Cold start: the window starts with the navigation and the CPU throttle is on from the first byte. Otherwise the app
   * boots unthrottled, rests, and the window covers only `run`.
   */
  cold?: { readySelector: string; tailMs: number };
  run?(context: ScenarioContext): Promise<ScenarioOutput | void>;
}

/** Calls a function of the page probe (`window.__pc`). The callbacks are inline arrows: nothing named to transpile. */
export function pc<T = void>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([fn, rest]) => (window as unknown as { __pc: Record<string, (...a: unknown[]) => unknown> }).__pc[fn](...rest),
    [name, args] as const,
  ) as Promise<T>;
}

export const CHAT_LIST_ROW = '.chat-list .ListItem';
const sleep = (page: Page, ms: number) => pc(page, 'sleep', ms);

/** Positions (0 = top) of the chats that receive a message: below the top, inside the rendered part of the list. */
const NEW_MESSAGE_RANKS = Array.from({ length: 20 }, (_, index) => 8 + index);

export const SCENARIOS: Scenario[] = [
  {
    id: 'boot',
    title: 'App shell boot',
    description:
      'Cold start until `#Main` (the logged-in shell) is rendered, plus 1.5 s. Works before the chat list is ported.',
    needs: ['shell'],
    cold: { readySelector: '#Main', tailMs: 1500 },
  },
  {
    id: 'cold-start',
    title: '1. Cold start to the chat list',
    description:
      'Navigation to the first rendered chat row (1200 mocked chats, folders), plus 1.5 s of follow-up work.',
    needs: ['chatList'],
    cold: { readySelector: CHAT_LIST_ROW, tailMs: 1500 },
  },
  {
    id: 'newmsg-burst',
    title: '2a. New messages, burst of 20',
    description: '20 new messages in chats 9-28 of the list delivered in one task; each chat moves to the top.',
    needs: ['chatList', 'inject'],
    async run({ page }) {
      await sleep(page, 300);
      await pc(page, 'newMessages', NEW_MESSAGE_RANKS, 'burst', 0);
      await sleep(page, 1500);
    },
  },
  {
    id: 'newmsg-seq',
    title: '2b. New messages, one by one',
    description: '20 new messages in chats 9-28, one per task, 100 ms apart; each chat moves to the top.',
    needs: ['chatList', 'inject'],
    async run({ page }) {
      await sleep(page, 300);
      await pc(page, 'newMessages', NEW_MESSAGE_RANKS, 'sequence', 100);
      await sleep(page, 1000);
    },
  },
  {
    id: 'storm',
    title: '3. Typing / online storm',
    description: '100 updates per second for 3 s: typing indicators and online/offline flips of the top private chats.',
    needs: ['chatList', 'inject'],
    async run({ page }) {
      await sleep(page, 300);
      await pc(page, 'storm', 100, 3000);
      await sleep(page, 1000);
    },
  },
  {
    id: 'scroll',
    title: '4. Scroll the chat list',
    description:
      'Scroll the 1200-chat list from the top to the bottom, 120 px per frame (the list pages in as it goes).',
    needs: ['chatList'],
    async run({ page }) {
      await sleep(page, 300);
      const scrolled = await pc<{ frames: number; scrollHeight: number }>(page, 'scrollToBottom', 120, 60_000);
      await sleep(page, 500);
      return { extra: { scrollFrames: scrolled.frames, scrollHeightPx: scrolled.scrollHeight } };
    },
  },
  {
    id: 'folders',
    title: '5. Switch chat folders x10',
    description: '10 folder switches (slide animation each, 200 ms rest between).',
    needs: ['folders'],
    async run({ page }) {
      await sleep(page, 300);
      await pc(page, 'switchFolders', [1, 2, 3, 4, 0, 1, 2, 3, 4, 0], 200);
      await sleep(page, 500);
    },
  },
  {
    id: 'heavy-animation',
    title: '6. Updates during a blocking animation',
    description:
      'A folder slide (blocking animation) starts, 20 new messages arrive during it (the first after 60 ms, then 10 ms apart); ' +
      'the longest task after the animation ended is the metric (the heavy-animation gating claim).',
    needs: ['folders', 'inject'],
    async run({ page }) {
      await sleep(page, 300);
      const { animationEnd } = await pc<{ animationEnd: number }>(page, 'updatesDuringAnimation', 2, 20, 60, 10);
      await sleep(page, 1500);
      return { animationEnd };
    },
  },
  {
    id: 'open-chat',
    title: '7. Open a chat and scroll its history',
    description:
      "The top chat of the list (a 400-message history, every request is answered with the whole chat, as telegram-tt's mock does) is opened " +
      'through the `openChat` action; once its first message is rendered, the list is scrolled up, 400 px per frame, until the first message is reached.',
    needs: ['chatList', 'inject'],
    async run({ page }) {
      await sleep(page, 300);
      const opened = await pc<boolean>(page, 'openFirstChat');
      await sleep(page, 1500);
      const scrolled = await pc<{ frames: number; messages: number; firstId: number }>(
        page,
        'scrollHistoryUp',
        400,
        60_000,
      );
      await sleep(page, 500);
      return {
        extra: {
          chatOpened: opened ? 1 : 0,
          scrollFrames: scrolled.frames,
          messagesRendered: scrolled.messages,
          firstMessageId: scrolled.firstId,
        },
      };
    },
  },
  {
    id: 'typing',
    title: '8. Type 200 characters and send 10 messages',
    description:
      'A chat with a short history (rank 5 of the list; the 400-message chat would put the cost of opening a history into the window) is opened, then 10 messages of 20 characters are typed into the composer (keydown, insertText, keyup per ' +
      'character) and sent with the main button, 100 ms apart. The input latency of a character is the time from its keydown until the ' +
      'frame after the one that applied it has started (the update is on screen); the mocked server answers each send in both apps.',
    needs: ['chatList', 'inject'],
    async run({ page }) {
      await sleep(page, 300);
      const opened = await pc<boolean>(page, 'openFirstChat', 5);
      await pc<boolean>(page, 'waitForCount', '#editable-message-text[contenteditable="true"]', 1, 20000);
      await sleep(page, 1500);
      const result = await pc<{ latencies: number[]; sent: number; typingStart: number }>(
        page,
        'typeAndSend',
        20,
        10,
        100,
      );
      await sleep(page, 500);
      const sorted = [...result.latencies].sort((a, b) => a - b);
      const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
      return {
        splitAt: result.typingStart,
        extra: {
          chatOpened: opened ? 1 : 0,
          messagesSent: result.sent,
          inputLatencyP50Ms: at(0.5),
          inputLatencyP95Ms: at(0.95),
          inputLatencyMaxMs: sorted[sorted.length - 1] ?? 0,
        },
      };
    },
  },
];

export function scenarioById(id: string) {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
