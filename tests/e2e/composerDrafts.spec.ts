// The composer's drafts, edit mode and code fences in the real app (composer slice, fix round 1), against the mocked client's
// `messages` scenario. Nothing here mocks an action: the store, the effects and the mocked server do the work.
import type { Page } from '@playwright/test';

import { openApp } from './authHelpers';
import { expect, test } from './fixtures';

type TestWindow = {
  getActions: () => Record<string, (payload?: Record<string, unknown>) => void>;
  getGlobal: () => Record<string, any>;
};

const ROW = '#LeftColumn .chat-list .ListItem.Chat';
const LIST = '#MiddleColumn .MessageList';
const ITEM = `${LIST} .message-list-item`;
const INPUT = '#editable-message-text';
const SEND = '.Composer .main-button';
const BAR = '.Composer .ComposerEmbeddedMessage';
const CAROL = '7';

// The known noise of the mocked client: no full user info / folders / language pack (see tests/e2e/strictMonitor.ts)
const IGNORED_CONSOLE = [/GetFullUser|buildApiUserFullInfo|reading 'id'/, /action "loadFullUser" failed/];
test.use({ strictOptions: { ignoreConsole: IGNORED_CONSOLE } });

async function openMessages(page: Page) {
  await openApp(page, '/#?mockScenario=messages');
  await expect(page.locator(ROW)).toHaveCount(6);
}

async function openChat(page: Page, name: string) {
  await page.locator(ROW).filter({ hasText: name }).click();
  await expect(page.locator('#MiddleColumn .MiddleHeader')).toContainText(name);
  await expect(page.locator(ITEM).first()).toBeVisible();
  // the editor is created asynchronously (the `editor` bundle)
  await expect(page.locator(INPUT)).toHaveAttribute('contenteditable', 'true');
  await page.waitForTimeout(800);
}

async function typeText(page: Page, text: string) {
  await page.locator(INPUT).click();
  await page.keyboard.type(text);
}

/** The text of the draft of a chat's main thread: `null` for a draft without text (a reply), `undefined` without a draft. */
const draftOf = (page: Page, chatTitle: string) =>
  page.evaluate((title) => {
    const global = (window as unknown as TestWindow).getGlobal();
    const chat = Object.values<any>(global.chats.byId).find((candidate) => candidate.title === title);
    const draft = global.messages.byChatId[chat.id]?.threadsById?.['-1']?.localState?.draft;
    return draft ? ((draft.text?.text as string | undefined) ?? null) : undefined;
  }, chatTitle);

async function lastMessageOf(page: Page, chatId: string) {
  return page.evaluate((id) => {
    const byId = (window as unknown as TestWindow).getGlobal().messages.byChatId[id].byId as Record<string, any>;
    const ids = Object.keys(byId)
      .map(Number)
      .sort((a, b) => a - b);
    const message = byId[ids[ids.length - 1]];
    return {
      text: message.content.text?.text as string | undefined,
      entities: (message.content.text?.entities || []) as { type: string; offset: number; length: number }[],
    };
  }, chatId);
}

test('a code fence typed into the input shows the code that follows and sends it as one pre entity', async ({
  page,
}) => {
  await openMessages(page);
  await openChat(page, 'Carol Short');

  await typeText(page, '``` let x = 1');
  // The text typed after the fence is visible inside one code block (the empty block used to lose its first character)
  const code = page.locator(`${INPUT} code[data-node-view-content]`);
  await expect(code).toHaveCount(1);
  await expect(code).toHaveText('let x = 1');
  await expect(page.locator(INPUT)).not.toContainText('```');

  await page.locator(SEND).click();
  await expect.poll(async () => (await lastMessageOf(page, CAROL)).text).toBe('let x = 1');
  const { entities } = await lastMessageOf(page, CAROL);
  expect(entities.map(({ type, offset, length }) => ({ type, offset, length }))).toEqual([
    { type: 'MessageEntityPre', offset: 0, length: 9 },
  ]);
});

test.describe('a chat switch while a heavy animation runs', () => {
  // Known issue of the messages slice (not the composer): the `MessageList` effect that runs once the animation is over reads
  // `container.parentElement` of the list of the chat that was left, which is gone by then. The error does not touch the
  // composer; it is reported in docs/reports/slice-composer.md.
  test.use({
    strictOptions: { ignoreConsole: [...IGNORED_CONSOLE, /Cannot read properties of null \(reading 'classList'\)/] },
  });

  // The main-menu "Saved Messages" item and the hotkeys switch without `forceOnHeavyAnimation`, so the switch lands while a
  // root heavy animation (a closing menu, a scroll animation) holds back the effects that a store write dirtied.
  async function beginHeavyAnimation(page: Page) {
    await page.evaluate(async () => {
      const engine = await import(/* @vite-ignore */ '/src/vendor/frameact/src/index.ts');
      (window as unknown as { __endHeavyAnimation: () => void }).__endHeavyAnimation =
        engine.beginHeavyAnimation(Infinity);
    });
  }

  const endHeavyAnimation = (page: Page) =>
    page.evaluate(() => (window as unknown as { __endHeavyAnimation: () => void }).__endHeavyAnimation());

  test('a switch during a heavy animation: the text of the chat that is left is saved, the draft of the next chat is kept', async ({
    page,
  }) => {
    await openMessages(page);
    // Bob has a draft: typed, then saved by leaving the chat
    await openChat(page, 'Bob Reader');
    await typeText(page, 'draft for Bob');
    await openChat(page, 'Carol Short');
    await expect.poll(() => draftOf(page, 'Bob Reader')).toBe('draft for Bob');

    await typeText(page, 'unsent for Carol');
    await beginHeavyAnimation(page);
    // what the Saved Messages item and the hotkeys call: a store switch without `forceOnHeavyAnimation`
    await page.evaluate(() => {
      const window2 = window as unknown as TestWindow;
      const bob = Object.values<any>(window2.getGlobal().chats.byId).find(({ title }) => title === 'Bob Reader');
      window2.getActions().openChat({ id: bob.id, shouldReplaceHistory: true });
    });
    await page.waitForTimeout(500);
    await endHeavyAnimation(page);

    await expect(page.locator('#MiddleColumn .MiddleHeader')).toContainText('Bob Reader');
    await expect(page.locator(INPUT)).toContainText('draft for Bob');
    await expect.poll(() => draftOf(page, 'Carol Short')).toBe('unsent for Carol');
    await expect.poll(() => draftOf(page, 'Bob Reader')).toBe('draft for Bob');

    await openChat(page, 'Carol Short');
    await expect(page.locator(INPUT)).toContainText('unsent for Carol');
  });
});

test.describe('edit mode', () => {
  async function startEditing(page: Page) {
    await openMessages(page);
    await openChat(page, 'Carol Short');
    await typeText(page, 'my draft');
    // leaving the chat saves the draft; coming back restores it
    await openChat(page, 'Bob Reader');
    await openChat(page, 'Carol Short');
    await expect(page.locator(INPUT)).toContainText('my draft');

    await page.evaluate(() => {
      (window as unknown as TestWindow).getActions().setEditingId({ messageId: 2002 });
    });
    await expect(page.locator(BAR)).toContainText(/Edit\s?Message/i);
    await expect(page.locator(INPUT)).toContainText('Carol two');
  }

  test('Escape leaves edit mode and brings back the draft that was there before the edit', async ({ page }) => {
    await startEditing(page);

    await page.keyboard.press('Escape');

    await expect(page.locator(BAR)).toHaveCount(0);
    await expect(page.locator(INPUT)).toContainText('my draft');
    await expect(page.locator(INPUT)).not.toContainText('Carol two');
  });

  test('the cancel button of the bar does the same', async ({ page }) => {
    await startEditing(page);

    await page.locator(`${BAR} .embedded-cancel`).click();

    await expect(page.locator(BAR)).toHaveCount(0);
    await expect(page.locator(INPUT)).toContainText('my draft');
    await expect(page.locator(INPUT)).not.toContainText('Carol two');
  });

  test('the edited text is kept while another chat is open, and comes back with the chat', async ({ page }) => {
    await startEditing(page);
    await page.locator(INPUT).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' (wip)');

    await openChat(page, 'Bob Reader');
    await expect(page.locator(BAR)).toHaveCount(0);
    await expect(page.locator(INPUT)).not.toContainText('wip');

    await openChat(page, 'Carol Short');
    await expect(page.locator(BAR)).toContainText(/Edit\s?Message/i);
    await expect(page.locator(INPUT)).toContainText('Carol two (wip)');
  });
});
