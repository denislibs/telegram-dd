// Original test (not in telegram-tt): the classes of `.message-content` that the stylesheet selects.
import { describe, expect, it } from 'vitest';

import type { ApiMessage, ApiPhoto, ApiSticker } from '../../../../api/types';

import { buildContentClassName } from './buildContentClassName';

const message = (content: ApiMessage['content'], extra: Partial<ApiMessage> = {}) => ({
  id: 1,
  chatId: '1',
  date: 1,
  isOutgoing: false,
  content,
  ...extra,
});
const classesOf = (...args: Parameters<typeof buildContentClassName>) =>
  new Set(buildContentClassName(...args).split(' '));

describe('buildContentClassName', () => {
  it('a text message: text bubble with a solid background; the tail only on the last message of a group', () => {
    const text = message({ text: { text: 'hello' } });

    const last = classesOf(text, undefined, { isLastInGroup: true });
    expect(last).toContain('message-content');
    expect(last).toContain('text');
    expect(last).toContain('has-shadow');
    expect(last).toContain('has-solid-background');
    expect(last).toContain('has-appendix');
    expect(last).toContain('has-footer');
    expect(last).not.toContain('media');
    expect(last).not.toContain('no-text');

    expect(classesOf(text, undefined, { isLastInGroup: false })).not.toContain('has-appendix');
    // an inline keyboard under the bubble takes the tail away
    expect(
      classesOf(message({ text: { text: 'hello' } }, { inlineButtons: [] }), undefined, { isLastInGroup: true }),
    ).not.toContain('has-appendix');
  });

  it('puts the peer color class right after the base class', () => {
    expect(
      buildContentClassName(message({ text: { text: 'hi' } }), undefined, { peerColorClass: 'peer-color-3' }),
    ).toMatch(/^message-content peer-color-3 text /);
  });

  it('an emoji-only text is not a text bubble', () => {
    const classes = classesOf(message({ text: { text: '👍', emojiOnlyCount: 1 } }), undefined, { isCustomShape: true });
    expect(classes).toContain('emoji-only');
    expect(classes).toContain('emoji-only-1');
    expect(classes).toContain('custom-shape');
    expect(classes).not.toContain('text');
    expect(classes).not.toContain('has-shadow');
    expect(classes).not.toContain('has-appendix');
  });

  it('a photo without a caption is a media bubble without a solid background, a captioned one has it', () => {
    const photo = { mediaType: 'photo', id: '1' } as unknown as ApiPhoto;

    const bare = classesOf(message({ photo }), undefined, { isLastInGroup: true });
    expect(bare).toContain('media');
    expect(bare).toContain('has-adaptive-width');
    expect(bare).toContain('no-text');
    expect(bare).toContain('no-footer');
    expect(bare).not.toContain('has-solid-background');
    // the tail of a bare photo is drawn by the photo itself (`shouldAffectAppendix`), the bubble keeps it
    expect(bare).toContain('has-appendix');

    const captioned = classesOf(message({ photo, text: { text: 'caption' } }), undefined, { isLastInGroup: true });
    expect(captioned).toContain('media');
    expect(captioned).toContain('text');
    expect(captioned).toContain('has-solid-background');
    expect(captioned).toContain('has-footer');
  });

  it('a sticker is a custom shape: no shadow, no tail', () => {
    const sticker = { mediaType: 'sticker', id: '1' } as unknown as ApiSticker;
    const classes = classesOf(message({ sticker }), undefined, { isCustomShape: true, isLastInGroup: true });
    expect(classes).toContain('custom-shape');
    expect(classes).not.toContain('has-shadow');
    expect(classes).not.toContain('has-appendix');
  });

  it('forwarded, via-bot, subheader, thread, reactions and fact check flags', () => {
    const classes = classesOf(message({ text: { text: 'x' } }, { viaBotId: '5' }), undefined, {
      asForwarded: true,
      hasSubheader: true,
      hasThread: true,
      hasReactions: true,
      hasOutsideReactions: true,
      forceSenderName: true,
      hasActionButton: true,
    });
    for (const name of [
      'is-forwarded',
      'has-subheader',
      'has-replies',
      'has-reactions',
      'has-outside-reactions',
      'is-via-bot',
      'force-sender-name',
      'has-action-button',
    ]) {
      expect(classes).toContain(name);
    }
  });

  it('a message with a fact check', () => {
    const classes = classesOf(message({ text: { text: 'x' } }, { factCheck: { text: { text: 'fc' } } as never }));
    expect(classes).toContain('has-fact-check');
    expect(classes).toContain('has-solid-background');
  });

  it('a message without a content is unsupported', () => {
    const classes = classesOf(message({}));
    expect(classes).toContain('unsupported');
    expect(classes).toContain('no-text');
    expect(classes).toContain('no-footer');
  });

  it('a voice message with a transcription', () => {
    const voice = { mediaType: 'voice', id: '1', duration: 3 } as never;
    const classes = classesOf(message({ voice }), undefined, { withVoiceTranscription: true });
    expect(classes).toContain('voice');
    expect(classes).toContain('with-voice-transcription');
    expect(classes).toContain('has-solid-background');
  });
});
