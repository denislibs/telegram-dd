// Original test (not in telegram-tt): the FOUNDATION STUB placeholders of the message media render tt's outer element with the
// size the call site implies, clamp the numbers of the server and show / load nothing.
import { render } from 'frameact/dom';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  ApiKeyboardButton,
  ApiMediaTodo,
  ApiMessage,
  ApiMessagePoll,
} from '../../../api/types';

import { container, useDomHarness } from '../../../lib/kit/testing/dom';
import {
  clampCount,
  clampNumber,
  getMediaPlaceholderSize,
  PLACEHOLDER_MAX_ASPECT_RATIO,
  PLACEHOLDER_MAX_MEDIA_PX,
  PLACEHOLDER_MIN_ASPECT_RATIO,
} from '../../common/helpers/placeholder';

import Audio from '../../common/Audio';
import Document from '../../common/Document';
import MessageRichText from '../../common/MessageRichText';
import CommentButton from './CommentButton';
import Contact from './Contact';
import DiceWrapper from './dice/DiceWrapper';
import FactCheck from './FactCheck';
import Game from './Game';
import Giveaway from './Giveaway';
import InlineButtons from './InlineButtons';
import Invoice from './Invoice';
import InvoiceMediaPreview from './InvoiceMediaPreview';
import Location from './Location';
import MessageEffect from './MessageEffect';
import MessagePhoneCall from './MessagePhoneCall';
import PaidMediaOverlay from './PaidMediaOverlay';
import Poll from './poll/Poll';
import Story from './Story';
import StoryMention from './StoryMention';
import TodoList from './TodoList';
import WebPage from './WebPage';

const HOSTILE_NUMBERS = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5, 0, 1e308, -1e308, 1e-300];

function message(content: ApiMessage['content']): ApiMessage {
  return { id: 1, chatId: '100', date: 1, isOutgoing: false, content };
}

/** The numbers of a style string: nothing of it may be NaN or Infinity. */
function expectFiniteStyle(el: HTMLElement) {
  const style = el.getAttribute('style') ?? '';
  expect(style).not.toMatch(/NaN|Infinity|e\+\d|e-\d/);
}

function expectInert(root: HTMLElement) {
  expect(root.querySelector('a, button, input, textarea, select, video, audio, img, canvas, iframe')).toBeNull();
  expect(root.querySelector('[tabindex], [href], [src], [contenteditable]')).toBeNull();
  expect(root.querySelector('script')).toBeNull();
}

describe('placeholder sizing helpers', () => {
  it('clamp a hostile number into the range', () => {
    for (const value of HOSTILE_NUMBERS) {
      const clamped = clampNumber(value, 2, 100, 7);
      expect(Number.isFinite(clamped)).toBe(true);
      expect(clamped).toBeGreaterThanOrEqual(2);
      expect(clamped).toBeLessThanOrEqual(100);
    }
    expect(clampNumber('9', 0, 10, 3)).toBe(3);
    expect(clampNumber(undefined, 0, 10, 3)).toBe(3);
    expect(clampNumber(50, 0, 10, 3)).toBe(10);
    expect(clampNumber(5, 0, 10, 3)).toBe(5);
  });

  it('clamp a count to a whole number', () => {
    expect(clampCount(2.7, 10)).toBe(2);
    expect(clampCount(1e9, 10)).toBe(10);
    expect(clampCount(Number.NaN, 10)).toBe(0);
    expect(clampCount(-3, 10)).toBe(0);
  });

  it('bound the width, the height and the aspect ratio of a media box', () => {
    for (const width of HOSTILE_NUMBERS) {
      for (const height of HOSTILE_NUMBERS) {
        const size = getMediaPlaceholderSize({ width, height });
        for (const value of [size.width, size.height, size.aspectRatio]) {
          expect(Number.isFinite(value)).toBe(true);
        }
        expect(size.width).toBeLessThanOrEqual(PLACEHOLDER_MAX_MEDIA_PX);
        expect(size.height).toBeLessThanOrEqual(PLACEHOLDER_MAX_MEDIA_PX);
        expect(size.aspectRatio).toBeGreaterThanOrEqual(PLACEHOLDER_MIN_ASPECT_RATIO);
        expect(size.aspectRatio).toBeLessThanOrEqual(PLACEHOLDER_MAX_ASPECT_RATIO);
      }
    }
    expect(getMediaPlaceholderSize({ width: 800, height: 600 }).aspectRatio).toBeCloseTo(4 / 3);
    expect(getMediaPlaceholderSize(undefined)).toEqual({ width: 1, height: 1, aspectRatio: 1 });
  });
});

describe('FOUNDATION STUB placeholders', () => {
  const harness = useDomHarness();
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  async function mount(jsx: () => any) {
    const el = container();
    dispose = render(jsx, el);
    await harness.frame();
    await harness.frame();
    return el;
  }

  it('PaidMediaOverlay: wraps its children, without a button or a click handler', async () => {
    const el = await mount(() => (
      <PaidMediaOverlay
        paidMedia={{ mediaType: 'paidMedia', starsAmount: 5, extendedMedia: [] } as never}
        chatId="1"
        messageId={2}
      >
        <div class="inner-media">media</div>
      </PaidMediaOverlay>
    ));

    const root = el.firstElementChild as HTMLElement;
    expect(root.style.position).toBe('relative');
    expect(root.querySelector('.inner-media')!.textContent).toBe('media');
    expect(root.querySelector('button')).toBeNull();
  });

  it('InvoiceMediaPreview and Invoice: sized by their media', async () => {
    const invoice = (extra: object) =>
      message({
        invoice: { mediaType: 'invoice', title: 'T', description: 'D', currency: 'USD', amount: 1, ...extra } as never,
      });

    const preview = await mount(() => (
      <InvoiceMediaPreview
        isConnected
        message={invoice({ extendedMedia: { mediaType: 'extendedMediaPreview', width: 500, height: 250 } })}
      />
    ));
    const previewFrame = preview.firstElementChild as HTMLElement;
    expect(previewFrame.classList.contains('media-inner')).toBe(true);
    expect(previewFrame.getAttribute('style')).toContain('--media-width: 500px');
    expect(previewFrame.getAttribute('style')).toContain('--media-aspect-ratio: 2');
    dispose?.();

    const withPhoto = await mount(() => (
      <Invoice
        theme="light"
        message={invoice({ photo: { mediaType: 'webDocument', url: 'x', dimensions: { width: 300, height: 300 } } })}
      />
    ));
    const imageContainer = withPhoto.querySelector<HTMLElement>('.invoice-image-container')!;
    expect(imageContainer.getAttribute('style')).toContain('--media-width: 300px');
    dispose?.();

    const withoutPhoto = await mount(() => <Invoice theme="light" message={invoice({})} />);
    expect(withoutPhoto.querySelector('.invoice-image-container')).toBeNull();
    expect(withoutPhoto.querySelector('.Invoice')).not.toBeNull();
  });

  it('InlineButtons: draws the shape of the keyboard only, with a bounded number of cells', async () => {
    const button = {
      text: 'SECRET TEXT',
      action: { type: 'url', url: 'javascript:alert(1)' },
    } as unknown as ApiKeyboardButton;
    const rows = Array.from({ length: 1000 }, () => Array.from({ length: 1000 }, () => button));
    const el = await mount(() => <InlineButtons inlineButtons={rows} className="extra" onClick={() => {}} />);

    const root = el.firstElementChild as HTMLElement;
    expect(root.classList.contains('extra')).toBe(true);
    expect(root.children.length).toBeLessThanOrEqual(20);
    expect(root.children[0].children.length).toBeLessThanOrEqual(8);
    expect(root.textContent).toBe('');
    expectInert(el);
  });

  it('InlineButtons: one row of three buttons', async () => {
    const button = { text: 'A', action: { type: 'callback' } } as unknown as ApiKeyboardButton;
    const el = await mount(() => <InlineButtons inlineButtons={[[button, button, button]]} onClick={() => {}} />);

    const root = el.firstElementChild as HTMLElement;
    expect(root.children).toHaveLength(1);
    expect(root.children[0].children).toHaveLength(3);
  });

  it('TodoList and Poll: the height follows the (clamped) number of items', async () => {
    const todo = (count: number): ApiMediaTodo =>
      ({ mediaType: 'todo', todo: { title: { text: '' }, items: Array.from({ length: count }, () => ({})) } }) as never;
    const heightOf = (el: HTMLElement) => Number(/height: ([\d.]+)rem/.exec(el.getAttribute('style')!)?.[1]);

    const small = await mount(() => <TodoList message={message({})} todoList={todo(2)} />);
    const smallHeight = heightOf(small.firstElementChild as HTMLElement);
    dispose?.();
    const big = await mount(() => <TodoList message={message({})} todoList={todo(10)} />);
    const bigHeight = heightOf(big.firstElementChild as HTMLElement);
    dispose?.();
    const huge = await mount(() => (
      <TodoList
        message={message({})}
        todoList={{ ...todo(0), todo: { title: { text: '' }, items: { length: 1e9 } as never } }}
      />
    ));
    const hugeHeight = heightOf(huge.firstElementChild as HTMLElement);
    expect(bigHeight).toBeGreaterThan(smallHeight);
    expect(hugeHeight).toBeLessThan(100);
    expect(Number.isFinite(hugeHeight)).toBe(true);
    dispose?.();

    const poll = (count: number) => ({ summary: { answers: { length: count } } }) as unknown as ApiMessagePoll;
    const pollHeight = async (count: number) => {
      const el = await mount(() => <Poll chatId="1" messageId={2} poll={poll(count)} theme="light" />);
      const height = heightOf(el.firstElementChild as HTMLElement);
      dispose?.();
      return height;
    };
    expect(await pollHeight(4)).toBeGreaterThan(await pollHeight(2));
    expect(await pollHeight(1e9)).toBeLessThan(100);
    expect(await pollHeight(Number.NaN)).toBeGreaterThan(0);
  });

  it('every placeholder renders one inert, labelled block', async () => {
    const noop = () => {};
    const msg = message({});
    const blocks: [string, () => any][] = [
      ['Contact', () => <Contact contact={{ phoneNumber: '1', firstName: 'A', lastName: 'B', userId: '5' }} />],
      ['Location', () => <Location message={msg} theme="light" />],
      ['Game', () => <Game message={msg} />],
      ['Giveaway', () => <Giveaway message={msg} />],
      ['MessagePhoneCall', () => <MessagePhoneCall message={msg} chatId="1" phoneCall={{} as never} />],
      ['Story', () => <Story message={msg} />],
      ['FactCheck', () => <FactCheck factCheck={{} as never} />],
      ['CommentButton', () => <CommentButton threadInfo={{ messagesCount: 1e308 } as never} />],
      ['WebPage', () => <WebPage messageWebPage={{} as never} webPage={{} as never} theme="light" />],
      ['DiceWrapper', () => <DiceWrapper dice={{ emoticon: '🎲', value: 3 } as never} />],
      ['Audio', () => <Audio theme="light" message={msg} variant="inline" />],
      ['Document', () => <Document document={{} as never} message={msg} onDateClick={noop} />],
      ['MessageRichText', () => <MessageRichText message={msg} theme="light" />],
    ];

    for (const [name, jsx] of blocks) {
      const el = await mount(jsx);
      expect(el.children, name).toHaveLength(1);
      const root = el.firstElementChild as HTMLElement;
      const labelled = root.getAttribute('aria-label') ? root : root.querySelector('[aria-label]');
      expect(labelled?.getAttribute('aria-label'), name).toMatch(/, not supported yet$/);
      expectInert(el);
      expectFiniteStyle(root);
      expect(root.textContent, name).toBe('');
      dispose?.();
      dispose = undefined;
      document.body.textContent = '';
    }
  });

  it('Game, Location and Dice have the sizes of tt', async () => {
    const msg = message({});
    const game = await mount(() => <Game message={msg} />);
    expect(game.querySelector<HTMLElement>('.Game .preview')!.style.width).toBe('480px');
    expect(game.querySelector<HTMLElement>('.Game .preview')!.style.height).toBe('270px');
    dispose?.();

    const dice = await mount(() => <DiceWrapper dice={{ emoticon: '🎲', value: 3 } as never} />);
    expect((dice.firstElementChild as HTMLElement).style.width).toBe('208px');
    dispose?.();

    const location = await mount(() => <Location message={msg} theme="light" />);
    const locationEl = location.firstElementChild as HTMLElement;
    expect(locationEl.classList.contains('Location')).toBe(true);
    expect(locationEl.style.width).toBe('30rem');
  });

  it('Contact: a registered contact is taller than an unregistered one', async () => {
    const heightOf = (el: HTMLElement) => Number(/height: ([\d.]+)rem/.exec(el.getAttribute('style')!)?.[1]);
    const registered = await mount(() => (
      <Contact contact={{ phoneNumber: '1', firstName: 'A', lastName: '', userId: '5' }} />
    ));
    const registeredHeight = heightOf(registered.firstElementChild as HTMLElement);
    dispose?.();
    const unregistered = await mount(() => (
      <Contact contact={{ phoneNumber: '1', firstName: 'A', lastName: '', userId: '0' }} />
    ));
    expect(heightOf(unregistered.firstElementChild as HTMLElement)).toBeLessThan(registeredHeight);
  });

  it('StoryMention and MessageEffect: the anchors tt styles through Message.scss', async () => {
    const mention = await mount(() => <StoryMention message={message({})} />);
    const mentionEl = mention.firstElementChild as HTMLElement;
    expect(mentionEl.classList.contains('action-message-story-mention')).toBe(true);
    expect(mentionEl.querySelector('.story-media-wrapper')).not.toBeNull();
    expect(mentionEl.getAttribute('aria-label')).toBe('Story mention, not supported yet');
    dispose?.();

    const effect = await mount(() => <MessageEffect effect={{} as never} isMirrored />);
    const anchor = effect.firstElementChild as HTMLElement;
    expect(anchor.getAttribute('aria-hidden')).toBe('true');
    expect(anchor.style.left).toBe('0px');
    expect(anchor.children).toHaveLength(0);
  });

  it('keeps the FOUNDATION STUB marker on the first line of every placeholder file', () => {
    const files = [
      'middle/message/Contact',
      'middle/message/Location',
      'middle/message/Game',
      'middle/message/Giveaway',
      'middle/message/Invoice',
      'middle/message/InvoiceMediaPreview',
      'middle/message/TodoList',
      'middle/message/PaidMediaOverlay',
      'middle/message/MessagePhoneCall',
      'middle/message/Story',
      'middle/message/StoryMention',
      'middle/message/MessageEffect',
      'middle/message/FactCheck',
      'middle/message/CommentButton',
      'middle/message/InlineButtons',
      'middle/message/WebPage',
      'middle/message/poll/Poll',
      'middle/message/dice/DiceWrapper',
      'common/Audio',
      'common/Document',
      'common/MessageRichText',
    ];
    for (const file of files) {
      const firstLine = readFileSync(`src/components/${file}.tsx`, 'utf8').split('\n')[0];
      expect(firstLine, file).toMatch(/^\/\/ FOUNDATION STUB: /);
    }
  });
});
