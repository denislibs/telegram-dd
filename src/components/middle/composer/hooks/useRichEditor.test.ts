// Original test (not in telegram-tt): the hook runs once and returns one object whose state fields are reactive getters;
// the editor is created when a root is registered, destroyed when the root goes away or the owner is disposed.
// @vitest-environment jsdom
import { createEffect, createRoot, createSignal, flushSync } from 'frameact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RichEditorRoot } from '../richEditorTypes';

import { MEDIA_NODE_NAME } from '../../../../util/tiptap/constants';
import useRichEditor from './useRichEditor';

// The factory must not import the editor module itself: that module reaches `moduleLoader` (mocked) and would deadlock.
vi.mock('../../../../util/moduleLoader', () => ({
  Bundles: { Editor: 'Editor' },
  loadBundle: async () => {
    const editorModule = await import('../helpers/richEditor');
    return {
      createRichEditor: editorModule.__createRichEditor,
      isRichEditorEmpty: editorModule.__isRichEditorEmpty,
      getRichEditorCanUndo: editorModule.__getRichEditorCanUndo,
      getRichEditorCanRedo: editorModule.__getRichEditorCanRedo,
    };
  },
}));

function buildRoot(): RichEditorRoot {
  const element = document.createElement('div');
  document.body.append(element);
  return {
    element,
    getIsRichInputExpanded: () => false,
    onReady: vi.fn(),
    onUpdate: vi.fn(),
    onDateClick: vi.fn(),
    onMediaEdit: vi.fn(),
    onMediaFiles: vi.fn(),
  };
}

// The editor module is imported lazily (as the bundle loader does), the first import is slow
const EMPTY_CAPTION = { text: { type: 'empty' as const }, credit: { type: 'empty' as const } };
const untilReady = (richEditor: { isReady: boolean }) =>
  vi.waitFor(() => expect(richEditor.isReady).toBe(true), { timeout: 10000 });

describe('useRichEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('creates the editor for a registered root and keeps the state getters reactive', async () => {
    const root = buildRoot();
    let richEditor!: ReturnType<typeof useRichEditor>;
    const seen: Array<{ isReady: boolean; text: string; canUndo: boolean; canRedo: boolean }> = [];
    const dispose = createRoot((stop) => {
      richEditor = useRichEditor(true, true, true, true);
      createEffect(
        () => ({
          isReady: richEditor.isReady,
          text: richEditor.value.blocks.length ? JSON.stringify(richEditor.value) : '',
          canUndo: richEditor.canUndo,
          canRedo: richEditor.canRedo,
        }),
        (state) => {
          seen.push(state);
        },
      );
      return stop;
    });

    expect(richEditor.isReady).toBe(false);
    expect(richEditor.editor).toBeUndefined();
    expect(richEditor.isEmpty()).toBe(true);

    const unregister = richEditor.registerRoot(root);
    flushSync();
    await untilReady(richEditor);

    expect(richEditor.isReady).toBe(true);
    expect(richEditor.editor).toBeDefined();
    expect(root.onReady).toHaveBeenCalledTimes(1);
    expect(richEditor.canUndo).toBe(false);

    richEditor.insertContent({ type: 'text', text: 'hi' });
    flushSync();
    expect(richEditor.getValue().blocks.length).toBeGreaterThan(0);
    expect(richEditor.value.blocks.length).toBeGreaterThan(0);
    expect(richEditor.isEmpty()).toBe(false);
    expect(richEditor.canUndo).toBe(true);
    expect(richEditor.canRedo).toBe(false);
    expect(seen.at(-1)?.canUndo).toBe(true);

    richEditor.undo();
    flushSync();
    expect(richEditor.canRedo).toBe(true);
    expect(richEditor.canUndo).toBe(false);

    const editor = richEditor.editor!;
    unregister();
    flushSync();
    expect(richEditor.isReady).toBe(false);
    expect(richEditor.editor).toBeUndefined();
    expect(editor.isDestroyed).toBe(true);
    dispose();
  });

  it('destroys the editor when the owner is disposed, and reads canSend* accessors', async () => {
    const root = buildRoot();
    const [canSendPhotos, setCanSendPhotos] = createSignal(false);
    let richEditor!: ReturnType<typeof useRichEditor>;
    const dispose = createRoot((stop) => {
      richEditor = useRichEditor(canSendPhotos, false, undefined, true);
      return stop;
    });
    richEditor.registerRoot(root);
    flushSync();
    await untilReady(richEditor);
    const editor = richEditor.editor!;
    expect(editor).toBeDefined();

    // The photo restriction follows the accessor: the editor filters a transaction that adds a photo while it is false.
    const hasMedia = () => JSON.stringify(editor.getJSON()).includes(MEDIA_NODE_NAME);
    richEditor.insertMedia([{ type: 'photo', uploadId: 'u1', caption: EMPTY_CAPTION }], 1);
    expect(hasMedia()).toBe(false);
    setCanSendPhotos(true);
    richEditor.insertMedia([{ type: 'photo', uploadId: 'u2', caption: EMPTY_CAPTION }], 1);
    expect(hasMedia()).toBe(true);

    dispose();
    flushSync();
    expect(editor.isDestroyed).toBe(true);
  });
});
