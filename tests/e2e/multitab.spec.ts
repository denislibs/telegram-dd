// T5 (docs/plans/2026-10-14-store.md): multitab end to end. Two pages of one browser context (a BroadcastChannel is
// shared by the pages of a context) boot the real entry against the in-repo MockClient: requestGlobal ->
// initGlobal -> init -> establishMultitabRole. The first page becomes the master, the second one gets its global; a
// chat written in page A appears in page B, and page B never sends A's own change back.
import { expect, test } from './fixtures';
import { createStrictMonitor } from './strictMonitor';

type AppWindow = Window & {
  getGlobal: () => any;
  setGlobal: (global: any) => void;
  __sent: { type: string; text: string }[];
};

// Record what each page posts on BroadcastChannels (the data channel carries `globalUpdate` / `globalDiffUpdate`).
const RECORD_BROADCASTS = () => {
  const sent: { type: string; text: string }[] = [];
  (window as unknown as AppWindow).__sent = sent;
  const post = BroadcastChannel.prototype.postMessage;
  BroadcastChannel.prototype.postMessage = function (message: any) {
    sent.push({ type: String(message?.type ?? Object.keys(message ?? {})[0]), text: JSON.stringify(message) });
    return post.call(this, message);
  };
};

const tabsOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const g = (window as unknown as AppWindow).getGlobal();
    return Object.fromEntries(Object.entries<any>(g.byTabId).map(([id, tab]) => [id, Boolean(tab.isMasterTab)]));
  });

test('a chat written in tab A reaches tab B, and tab B does not echo it back', async ({
  context,
  page: pageA,
  baseURL,
}) => {
  const pageB = await context.newPage();
  const monitorB = createStrictMonitor(pageB, new URL(baseURL!).origin);
  await pageA.addInitScript(RECORD_BROADCASTS);
  await pageB.addInitScript(RECORD_BROADCASTS);

  // tab A boots alone and becomes the master
  await pageA.goto('/');
  await expect
    .poll(() =>
      pageA.evaluate(() =>
        Object.values((window as unknown as AppWindow).getGlobal?.()?.byTabId ?? {}).some((t: any) => t.isMasterTab),
      ),
    )
    .toBe(true);
  const tabA = Object.keys(await tabsOf(pageA))[0];

  // tab B boots next to it: it asks for the global (requestGlobal), A answers, B is not the master
  await pageB.goto('/');
  await expect.poll(async () => Object.keys(await tabsOf(pageB)).length).toBe(2);
  const tabsB = await tabsOf(pageB);
  const tabB = Object.keys(tabsB).find((id) => id !== tabA)!;
  expect(tabsB[tabA]).toBe(true);
  expect(tabsB[tabB]).toBe(false);
  await expect.poll(async () => Object.keys(await tabsOf(pageA)).length).toBe(2);

  // quiet down, then count what B has posted so far
  await pageB.waitForTimeout(800);
  const sentByBBefore = await pageB.evaluate(() => (window as unknown as AppWindow).__sent.length);

  // A: a chat appears (an API update would write exactly this) and A's own tab state changes
  await pageA.evaluate(
    ([id]) => {
      const w = window as unknown as AppWindow;
      const g = w.getGlobal();
      w.setGlobal({
        ...g,
        chats: {
          ...g.chats,
          byId: { ...g.chats.byId, '777001': { id: '777001', title: 'From tab A', type: 'chatTypePrivate' } },
        },
        byTabId: { ...g.byTabId, [id]: { ...g.byTabId[id], isLeftColumnShown: !g.byTabId[id].isLeftColumnShown } },
      });
    },
    [tabA],
  );
  const leftColumnInA = await pageA.evaluate(
    (id) => (window as unknown as AppWindow).getGlobal().byTabId[id].isLeftColumnShown,
    tabA,
  );

  // B sees both: the chat and A's tab state (tt broadcasts every tab's state to every tab)
  await expect
    .poll(() => pageB.evaluate(() => (window as unknown as AppWindow).getGlobal().chats.byId['777001']?.title))
    .toBe('From tab A');
  await expect
    .poll(() =>
      pageB.evaluate((id) => (window as unknown as AppWindow).getGlobal().byTabId[id].isLeftColumnShown, tabA),
    )
    .toBe(leftColumnInA);
  // B's own tab state was not touched by A's write
  expect(await tabsOf(pageB)).toEqual(tabsB);

  // no echo: what B posted after receiving carries neither the chat nor A's tab state
  await pageB.waitForTimeout(1200); // past the idle flush (500 ms fallback) of tt's multitab
  const sentByB = await pageB.evaluate((from) => (window as unknown as AppWindow).__sent.slice(from), sentByBBefore);
  const echoed = sentByB.filter((m) => m.text.includes('777001') || m.text.includes(`"${tabA}"`));
  expect(echoed).toEqual([]);

  // controls: the recording sees the diff that A sent, and a write made in B travels the other way (and is sent by B)
  const sentByA = await pageA.evaluate(() => (window as unknown as AppWindow).__sent);
  expect(sentByA.some((m) => m.type === 'globalDiffUpdate' && m.text.includes('777001'))).toBe(true);
  await pageB.evaluate(() => {
    const w = window as unknown as AppWindow;
    const g = w.getGlobal();
    w.setGlobal({
      ...g,
      chats: {
        ...g.chats,
        byId: { ...g.chats.byId, '777002': { id: '777002', title: 'From tab B', type: 'chatTypePrivate' } },
      },
    });
  });
  await expect
    .poll(() => pageA.evaluate(() => (window as unknown as AppWindow).getGlobal().chats.byId['777002']?.title))
    .toBe('From tab B');
  const sentByBAfter = await pageB.evaluate(() => (window as unknown as AppWindow).__sent);
  expect(sentByBAfter.some((m) => m.type === 'globalDiffUpdate' && m.text.includes('777002'))).toBe(true);

  expect(await monitorB.problems()).toEqual([]);
  await pageB.close();
});
