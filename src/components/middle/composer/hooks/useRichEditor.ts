import type { Editor, JSONContent as TiptapJsonContent } from '@tiptap/core';
import { createEffect, createMemo, createSignal, onDestroy } from 'frameact';
import { depsOf } from '../../../../util/effectDeps';

import type { ApiInputRichMessage } from '../../../../api/types';
import type { RichEditorMediaAttrs, RichEditorMediaItem } from '../../../../util/tiptap/richMedia';
import type { RichEditor, RichEditorRoot } from '../richEditorTypes';

import { Bundles, loadBundle } from '../../../../util/moduleLoader';
import { MEDIA_NODE_NAME } from '../../../../util/tiptap/constants';
import {
  getRichEditorMediaAttrs,
  getRichMediaUploadIds,
  registerRichMedia,
  removeRichMediaUpload,
} from '../../../../util/tiptap/richMedia';
import setEditorContentWithoutHistory from '../../../../util/tiptap/setEditorContentWithoutHistory';
import {
  buildRichMessageFromTiptapJson,
  buildTiptapJsonFromRichMessage,
  getRichInputAsFormatted,
} from '../../../ui/textInput/richText';
import {
  deleteEditorCharacterBeforeSelection,
  hasEditorCollapsedSelection,
  insertEditorContent,
  replaceEditorRange,
} from '../helpers/richEditorComposer';

const EMPTY_RICH_MESSAGE: ApiInputRichMessage = { blocks: [] };

type EditorBundle = {
  getRichEditorCanRedo: (editor: Editor) => boolean;
  getRichEditorCanUndo: (editor: Editor) => boolean;
};

// TODO(codemod): useRichEditor: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useRichEditor(
  canSendPhotos?: boolean,
  canSendVideos?: boolean,
  canSendDocuments?: boolean,
  canSendAudios?: boolean,
) {
  let valueRef = EMPTY_RICH_MESSAGE;
  let metadataRef: Pick<ApiInputRichMessage, 'isRtl' | 'shouldDisableAutoLink'> = {};
  let ownedUploadIdsRef = new Set<string>();
  let editorRef: Editor | undefined;
  let editorBundleRef: EditorBundle | undefined;
  let isEditorEmptyRef: (editor: Editor) => boolean | undefined;
  let rootRef: RichEditorRoot | undefined;
  const [currentValue, setCurrentValue] = createSignal(EMPTY_RICH_MESSAGE);
  const [root, setRoot] = createSignal<RichEditorRoot | undefined>(undefined);
  const [isReady, setIsReady] = createSignal(false);
  const [hasUnresolvedMedia, setHasUnresolvedMedia] = createSignal(false);
  const canUndo = Boolean(editorRef && editorBundleRef?.getRichEditorCanUndo(editorRef));
  const canRedo = Boolean(editorRef && editorBundleRef?.getRichEditorCanRedo(editorRef));

  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  valueRef = currentValue();

  const getCanInsertMedia = (type: RichEditorMediaItem['type']) =>
    Boolean(
      type === 'document'
        ? canSendDocuments
        : type === 'audio'
          ? canSendAudios
          : type === 'photo'
            ? canSendPhotos
            : canSendVideos,
    );

  const clearMediaUploads = () => {
    ownedUploadIdsRef.forEach(removeRichMediaUpload);
    ownedUploadIdsRef.clear();
  };

  onDestroy(clearMediaUploads);

  const registerRoot = (nextRoot: RichEditorRoot) => {
    rootRef = nextRoot;
    setRoot(nextRoot);

    return () => {
      if (rootRef !== nextRoot) return;

      rootRef = undefined;
      setRoot(undefined);
    };
  };

  createEffect(
    depsOf(() => [getCanInsertMedia, root()] as const),
    ([, root2]) => {
      if (!root2) {
        editorRef?.destroy();
        editorRef = undefined;
        setIsReady(false);
        return undefined;
      }

      const currentRoot = root2;
      let isDestroyed = false;
      setIsReady(false);

      async function initEditor() {
        const editorBundle = await loadBundle(Bundles.Editor);
        const { createRichEditor, isRichEditorEmpty } = editorBundle;
        editorBundleRef = editorBundle;
        isEditorEmptyRef = isRichEditorEmpty;
        const editor = createRichEditor({
          element: currentRoot.element,
          sharedCanvasRef: currentRoot.sharedCanvasRef,
          sharedCanvasHqRef: currentRoot.sharedCanvasHqRef,
          content: buildTiptapJsonFromRichMessage(valueRef),
          tooltips: currentRoot.tooltips,
          getIsRichInputExpanded: currentRoot.getIsRichInputExpanded,
          getCanInsertMedia,
          onUpdate: (updatedEditor) => {
            const json = updatedEditor.getJSON();
            const richMessage = buildRichMessage(json, metadataRef);
            valueRef = richMessage;
            setCurrentValue(richMessage);
            setHasUnresolvedMedia(checkHasUnresolvedMedia(json));
            // Undo history retains media blocks and their local uploads until the document is reset
            getRichMediaUploadIds(json).forEach((uploadId) => ownedUploadIdsRef.add(uploadId));
            currentRoot.onUpdate(isRichEditorEmpty(updatedEditor), updatedEditor.view.dom);
          },
          onDateClick: currentRoot.onDateClick,
          onMediaEdit: currentRoot.onMediaEdit,
          onMediaFiles: currentRoot.onMediaFiles,
        });
        if (isDestroyed) {
          editor.destroy();
          return;
        }

        editorRef = editor;
        setIsReady(true);
        currentRoot.onReady(editor.view.dom);
      }

      void initEditor();

      return () => {
        isDestroyed = true;
        editorRef?.destroy();
        editorRef = undefined;
        setIsReady(false);
      };
    },
  );

  return createMemo<RichEditor>(() => ({
    editor: editorRef,
    isReady: isReady(),
    value: currentValue(),
    canUndo,
    canRedo,
    deleteCharacterBeforeSelection: () => deleteEditorCharacterBeforeSelection(editorRef),
    focus: () => {
      editorRef?.commands.focus();
    },
    getAsFormatted: () => {
      const valueToFormat = editorRef ? buildRichMessage(editorRef.getJSON(), metadataRef) : valueRef;

      return getRichInputAsFormatted(valueToFormat);
    },
    getValue: () => {
      if (editorRef) {
        return buildRichMessage(editorRef.getJSON(), metadataRef);
      }

      return valueRef;
    },
    hasCollapsedSelection: () => hasEditorCollapsedSelection(editorRef),
    hasUnresolvedMedia: hasUnresolvedMedia(),
    isEmpty: () => {
      const editor = editorRef;
      if (!editor) {
        return !valueRef.blocks.length;
      }

      return isEditorEmptyRef ? isEditorEmptyRef(editor) : !valueRef.blocks.length;
    },
    insertContent: (content, shouldPrepend) => insertEditorContent(editorRef, content, shouldPrepend),
    insertMedia: (items, position, shouldAppend) => insertRichEditorMedia(editorRef, items, position, shouldAppend),
    redo: () => {
      editorRef?.chain().focus().redo().run();
    },
    replaceValue: (nextValue) => {
      metadataRef = getRichMessageMetadata(nextValue);
      valueRef = nextValue;
      setCurrentValue(nextValue);
      const json = buildTiptapJsonFromRichMessage(nextValue);
      setHasUnresolvedMedia(checkHasUnresolvedMedia(json));
      editorRef?.chain().setContent(json, { emitUpdate: false }).focus('end').run();
    },
    replaceRange: (range, content) => {
      replaceEditorRange(editorRef, range, content);
    },
    registerRoot,
    resetMedia: (uploadId) => {
      setRichEditorMedia(editorRef, uploadId);
    },
    resolveMedia: (uploadId, media) => {
      if (media) setRichEditorMedia(editorRef, uploadId, media);
    },
    setValue: (nextValue) => {
      clearMediaUploads();
      const valueToSet = nextValue || EMPTY_RICH_MESSAGE;
      metadataRef = getRichMessageMetadata(valueToSet);
      valueRef = valueToSet;
      setCurrentValue(valueToSet);
      const json = buildTiptapJsonFromRichMessage(valueToSet);
      setHasUnresolvedMedia(checkHasUnresolvedMedia(json));
      if (editorRef) {
        setEditorContentWithoutHistory(editorRef, json);
      }
    },
    undo: () => {
      editorRef?.chain().focus().undo().run();
    },
  }));
}

function insertRichEditorMedia(
  editor: Editor | undefined,
  items: RichEditorMediaItem[],
  position: number,
  shouldAppend?: boolean,
) {
  if (!editor || !items.length) return false;

  items.forEach(({ media }) => {
    if (media) registerRichMedia(media);
  });

  if (shouldAppend && items.every((item) => item.type === 'photo' || item.type === 'video')) {
    const currentNode = editor.state.doc.nodeAt(position);
    const currentAttrs = currentNode && getRichEditorMediaAttrs(currentNode.toJSON());
    if (
      currentNode?.type.name === MEDIA_NODE_NAME &&
      currentAttrs &&
      currentAttrs.kind !== 'document' &&
      currentAttrs.kind !== 'audio'
    ) {
      const nextItems = [...currentAttrs.items, ...items];
      editor.view.dispatch(
        editor.state.tr
          .setNodeMarkup(position, undefined, {
            ...currentAttrs,
            kind: currentAttrs.items.length === 1 ? 'collage' : currentAttrs.kind,
            items: nextItems,
          })
          .scrollIntoView(),
      );
      editor.commands.focus();
      return true;
    }
  }

  return editor.chain().focus().insertContentAt(position, items.map(buildMediaNode)).run();
}

function setRichEditorMedia(
  editor: Editor | undefined,
  uploadId: string,
  media?: NonNullable<RichEditorMediaItem['media']>,
) {
  if (!editor) return;

  let didResolve = false;
  const transaction = editor.state.tr;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== MEDIA_NODE_NAME) return;

    const attrs = getRichEditorMediaAttrs(node.toJSON());
    if (!attrs) return;

    const itemIndex = attrs.items.findIndex((item) => item.uploadId === uploadId);
    if (itemIndex < 0) return;

    const items = attrs.items.slice();
    items[itemIndex] = {
      ...items[itemIndex],
      media,
    };
    transaction.setNodeMarkup(position, undefined, { ...attrs, items });
    didResolve = true;
  });
  if (!didResolve) return;

  if (media) registerRichMedia(media);
  transaction.setMeta('addToHistory', false);
  editor.view.dispatch(transaction);
}

function buildMediaNode(item: RichEditorMediaItem) {
  const attrs: RichEditorMediaAttrs = {
    kind: item.type,
    items: [item],
    credit: { type: 'empty' },
  };
  return {
    type: MEDIA_NODE_NAME,
    attrs,
    content: [],
  };
}

function checkHasUnresolvedMedia(node: TiptapJsonContent): boolean {
  if (node.type === MEDIA_NODE_NAME && getRichEditorMediaAttrs(node)?.items.some(({ media }) => !media)) {
    return true;
  }

  return node.content?.some(checkHasUnresolvedMedia) || false;
}

function buildRichMessage(
  json: TiptapJsonContent,
  metadata: Pick<ApiInputRichMessage, 'isRtl' | 'shouldDisableAutoLink'>,
) {
  return {
    ...buildRichMessageFromTiptapJson(json),
    ...metadata,
  };
}

function getRichMessageMetadata(value: ApiInputRichMessage) {
  return {
    isRtl: value.isRtl,
    shouldDisableAutoLink: value.shouldDisableAutoLink,
  };
}
