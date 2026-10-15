// Helpers of the specs that open a chat of the mocked client (the media slice's specs; messages.spec.ts keeps its own copies).
import type { Page } from '@playwright/test';

import { openApp } from './authHelpers';
import { expect } from './fixtures';

export const ROW = '#LeftColumn .chat-list .ListItem.Chat';
export const LIST = '#MiddleColumn .MessageList';
export const ITEM = `${LIST} .message-list-item`;

// The known noise of the mocked client (no full user info, no channel difference, ...): see tests/e2e/messages.spec.ts.
export const MOCK_NOISE = [
  /GetFullUser|buildApiUserFullInfo|reading 'id'/,
  /action "loadFullUser" failed/,
  /SafeLink.getDecodedUrl error/,
  /\[UpdateManager\] Channel for difference not found/,
];

export type TestWindow = {
  getActions: () => Record<string, (payload?: any) => void>;
  getGlobal: () => Record<string, any>;
};

export async function openScenario(page: Page, scenario: string, chats: number) {
  await openApp(page, `/#?mockScenario=${scenario}`);
  await expect(page.locator(ROW)).toHaveCount(chats);
}

// the list has been quiet (no scroll, no new items) for a while: loads and animations are over
export async function settle(page: Page, quietMs = 500) {
  await page.evaluate(
    (ms) =>
      new Promise<void>((resolve) => {
        const list = document.querySelector('#MiddleColumn .MessageList') as HTMLElement;
        const state = () =>
          `${list.scrollTop}|${list.scrollHeight}|${list.querySelectorAll('.message-list-item').length}`;
        let last = state();
        let since = performance.now();
        const tick = () => {
          const now = state();
          if (now !== last) {
            last = now;
            since = performance.now();
          }
          if (performance.now() - since >= ms) resolve();
          else setTimeout(tick, 50);
        };
        tick();
      }),
    quietMs,
  );
}

export async function openChat(page: Page, name: string) {
  await page.locator(ROW).filter({ hasText: name }).click();
  await expect(page.locator('#MiddleColumn .MiddleHeader')).toContainText(name);
  await expect(page.locator(ITEM).first()).toBeVisible();
  await settle(page);
}

export async function scrollListTo(page: Page, where: 'top' | 'bottom') {
  await page.evaluate((to) => {
    const list = document.querySelector('#MiddleColumn .MessageList') as HTMLElement;
    list.scrollTop = to === 'top' ? 0 : list.scrollHeight;
  }, where);
}
