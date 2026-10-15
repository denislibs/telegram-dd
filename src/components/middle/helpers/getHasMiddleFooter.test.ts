// Original test (not in telegram-tt): which states of the open chat need the middle column footer.
import { describe, expect, it } from 'vitest';

import getHasMiddleFooter, { getHasFooterActionBar } from './getHasMiddleFooter';

describe('getHasFooterActionBar', () => {
  it('is false for nothing and for a composer-only chat', () => {
    expect(getHasFooterActionBar({})).toBe(false);
    expect(getHasFooterActionBar({ canPost: true })).toBe(false);
  });

  it.each([
    'canSubscribe',
    'shouldJoinToSend',
    'shouldSendJoinRequest',
    'canStartBot',
    'canRestartBot',
    'canUnblock',
    'isChannelMuteBar',
    'canShowOpenChatButton',
  ] as const)('is true for %s', (key) => {
    expect(getHasFooterActionBar({ [key]: true })).toBe(true);
  });

  it('shows the unpin bar only in a pinned list where unpinning is allowed', () => {
    expect(getHasFooterActionBar({ isPinnedMessageList: true })).toBe(false);
    expect(getHasFooterActionBar({ canUnpin: true })).toBe(false);
    expect(getHasFooterActionBar({ isPinnedMessageList: true, canUnpin: true })).toBe(true);
  });
});

describe('getHasMiddleFooter', () => {
  it('has no footer when nothing is shown at the bottom', () => {
    expect(getHasMiddleFooter({})).toBe(false);
  });

  it('has a footer with a composer, an extra shift or an action bar', () => {
    expect(getHasMiddleFooter({ canPost: true })).toBe(true);
    expect(getHasMiddleFooter({ withExtraShift: true })).toBe(true);
    expect(getHasMiddleFooter({ canStartBot: true })).toBe(true);
  });

  it('does not count the pinned flag alone', () => {
    expect(getHasMiddleFooter({ isPinnedMessageList: true })).toBe(false);
  });
});
