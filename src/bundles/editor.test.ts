// Original test (not in telegram-tt): the plain-text copy of the `editor` bundle stub (Ctrl+C on message text).
import { describe, expect, it } from 'vitest';

import { buildMessageCopyContent, getPlainTextOfSelectionHtml } from './editor';

const BRAILLE = /^[⠀-⣿]+$/;

describe('plain text of a selection', () => {
  it('is the text of the selected messages, with their line breaks', () => {
    expect(getPlainTextOfSelectionHtml('<div class="text-content">first line<br>second line</div>')).toBe(
      'first line\nsecond line',
    );
    expect(getPlainTextOfSelectionHtml('<strong>bold</strong> and <em>italic</em>')).toBe('bold and italic');
  });

  it('never carries the text of a concealed spoiler', () => {
    const html =
      'a <span class="Spoiler Spoiler--concealed"><span class="Spoiler__content">SECRET code</span></span> b ' +
      '<span class="Spoiler"><span class="Spoiler__content">revealed</span></span>';
    const text = getPlainTextOfSelectionHtml(html);

    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('code');
    expect(text).toContain('revealed');
    expect(text.replace(/[\s\w]/g, '')).toMatch(BRAILLE);
  });

  it('does not run anything in the markup of the selection', () => {
    const text = getPlainTextOfSelectionHtml(
      '<img src="x" onerror="globalThis.__copyXss = 1">text<script>globalThis.__copyXss = 2</script>',
    );
    expect(text).toBe('text');
    expect((globalThis as Record<string, unknown>).__copyXss).toBeUndefined();
  });
});

describe('buildMessageCopyContent', () => {
  it('builds the plain text of a selection request, and escapes the html it offers', async () => {
    const content = await buildMessageCopyContent(
      { chatId: '1', threadId: -1, type: 'thread' },
      {
        type: 'selection',
        chatId: '1',
        threadId: -1,
        messageListType: 'thread',
        messageId: 5,
        html: 'a <b>b</b> &lt;c&gt;',
      },
    );

    expect(content.plainText).toBe('a b <c>');
    expect(content.html).toBe('a b &lt;c&gt;');
  });
});
