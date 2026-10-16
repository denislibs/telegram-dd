// Original test (not in telegram-tt): the paste decision of `useClipboardPaste`, which handles untrusted clipboard input.
// A paste of plain text is left to the editor (the listener neither prevents nor consumes it); only a paste that carries
// files, into one of the three editable inputs and while that input has focus, is taken over.
import { createRoot, createSignal, flushSync } from 'frameact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiAttachment } from '../../../../api/types';

import useClipboardPaste from './useClipboardPaste';

const { actions, revokeAttachmentUrls } = vi.hoisted(() => ({
  actions: {
    showNotification: vi.fn(),
    updateShouldSaveAttachmentsCompression: vi.fn(),
    applyDefaultAttachmentsCompression: vi.fn(),
  },
  revokeAttachmentUrls: vi.fn(),
}));

vi.mock('../../../../global', () => ({ getActions: () => actions }));
vi.mock('../../../../hooks/useLang', () => ({ default: () => (key: string) => key }));
vi.mock('../../../../util/attachments', () => ({ revokeAttachmentUrls }));
vi.mock('../helpers/buildAttachment', () => ({
  default: (filename: string): Promise<ApiAttachment> =>
    Promise.resolve({ filename, mimeType: 'image/png', size: 1, blobUrl: `blob:${filename}` } as ApiAttachment),
}));

type FakeItem = {
  kind: 'file' | 'string';
  getAsFile: () => File | undefined;
  webkitGetAsEntry: () => undefined;
};

function fileItem(name: string): FakeItem {
  return {
    kind: 'file',
    getAsFile: () => new File(['x'], name, { type: 'image/png' }),
    webkitGetAsEntry: () => undefined,
  };
}

const textItem: FakeItem = { kind: 'string', getAsFile: () => undefined, webkitGetAsEntry: () => undefined };

function firePaste(target: Element, items: FakeItem[], text = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { items, getData: (type: string) => (type === 'text' ? text : '') },
  });
  target.dispatchEvent(event);
  return event;
}

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    flushSync();
    await Promise.resolve();
  }
};

describe('useClipboardPaste', () => {
  let input: HTMLDivElement;
  let dispose: () => void;
  const insertText = vi.fn();
  const setAttachments = vi.fn();
  const onRichMediaFiles = vi.fn();
  const [isActive, setIsActive] = createSignal(true);
  let target: 'attachmentModal' | 'richMedia' | 'none' = 'attachmentModal';

  beforeEach(async () => {
    insertText.mockReset();
    setAttachments.mockReset();
    onRichMediaFiles.mockReset();
    revokeAttachmentUrls.mockReset();
    setIsActive(true);
    target = 'attachmentModal';

    input = document.createElement('div');
    input.id = 'editable-message-text';
    input.setAttribute('contenteditable', 'true');
    input.tabIndex = 0;
    document.body.append(input);
    input.focus();

    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      useClipboardPaste(
        isActive,
        insertText,
        setAttachments,
        undefined,
        () => target,
        false,
        false,
        onRichMediaFiles,
        () => 3,
      );
    });
    await settle();
  });

  afterEach(() => {
    dispose();
    input.remove();
  });

  it('leaves a text-only paste to the editor', async () => {
    const event = firePaste(input, [textItem], 'hello');
    await settle();

    expect(event.defaultPrevented).toBe(false);
    expect(setAttachments).not.toHaveBeenCalled();
    expect(insertText).not.toHaveBeenCalled();
  });

  it('takes over a paste with a file: prevents the default, sets the attachment and inserts the pasted text', async () => {
    const event = firePaste(input, [fileItem('a.png'), textItem], 'caption');
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(setAttachments).toHaveBeenCalledTimes(1);
    const update = setAttachments.mock.calls[0][0] as (current: ApiAttachment[]) => ApiAttachment[];
    expect(update([]).map((attachment) => attachment.filename)).toEqual(['a.png']);
    expect(insertText).toHaveBeenCalledWith({ text: 'caption' });
  });

  it('ignores a file paste into an element that is not one of the editable inputs', async () => {
    const other = document.createElement('div');
    other.id = 'some-other-editable';
    other.setAttribute('contenteditable', 'true');
    other.tabIndex = 0;
    document.body.append(other);
    other.focus();

    const event = firePaste(other, [fileItem('a.png')]);
    await settle();

    expect(event.defaultPrevented).toBe(false);
    expect(setAttachments).not.toHaveBeenCalled();
    other.remove();
  });

  it('ignores a paste into an input that has no focus (a browser extension pasting into its own panel)', async () => {
    input.blur();
    const event = firePaste(input, [fileItem('a.png')]);
    await settle();

    expect(event.defaultPrevented).toBe(false);
    expect(setAttachments).not.toHaveBeenCalled();
  });

  it('swallows the paste without attaching when the target resolves to none', async () => {
    target = 'none';
    const event = firePaste(input, [fileItem('a.png')]);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(setAttachments).not.toHaveBeenCalled();
    expect(onRichMediaFiles).not.toHaveBeenCalled();
  });

  it('hands the files and the caret position to the rich editor when the target is rich media', async () => {
    target = 'richMedia';
    const event = firePaste(input, [fileItem('a.png')]);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(onRichMediaFiles).toHaveBeenCalledTimes(1);
    expect(onRichMediaFiles.mock.calls[0][1]).toBe(3);
    expect((onRichMediaFiles.mock.calls[0][0] as File[]).map((file) => file.name)).toEqual(['a.png']);
    expect(setAttachments).not.toHaveBeenCalled();
  });

  it('does not listen while inactive', async () => {
    setIsActive(false);
    await settle();

    const event = firePaste(input, [fileItem('a.png')]);
    await settle();

    expect(event.defaultPrevented).toBe(false);
    expect(setAttachments).not.toHaveBeenCalled();
  });
});
