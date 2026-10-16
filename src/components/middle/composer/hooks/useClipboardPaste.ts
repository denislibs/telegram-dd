import { createEffect } from 'frameact';
import { getActions } from '../../../../global';

import type { ApiAttachment, ApiFormattedText, ApiMessage } from '../../../../api/types';
import type { RichEditorMediaFilesHandler } from '../richEditorTypes';

import { EDITABLE_INPUT_ID, EDITABLE_INPUT_MODAL_ID, EDITABLE_STORY_INPUT_ID } from '../../../../config';
import { canReplaceMessageMedia, isUploadingFileSticker } from '../../../../global/helpers';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { revokeAttachmentUrls } from '../../../../util/attachments';
import { depsOf } from '../../../../util/effectDeps';
import buildAttachment from '../helpers/buildAttachment';
import getFilesFromDataTransferItems from '../helpers/getFilesFromDataTransferItems';

import useLang from '../../../../hooks/useLang';

const VALID_TARGET_IDS = new Set([EDITABLE_INPUT_ID, EDITABLE_INPUT_MODAL_ID, EDITABLE_STORY_INPUT_ID]);
const CLOSEST_CONTENT_EDITABLE_SELECTOR = 'div[contenteditable]';

type ClipboardFilePasteTarget = 'attachmentModal' | 'richMedia' | 'none';

// Deviation: a hook runs once. `isActive`, `editedMessage`, `shouldUpdateAttachmentCompression` and `shouldSkipFilePaste`
// may be accessors; the listener is registered by an effect that snapshots them (as tt's closure did on each render), the
// callbacks are plain functions (they read accessors when called), and `lang` reads the language signal.
const useClipboardPaste = (
  isActive: MaybeAccessor<boolean>,
  insertTextAndUpdateCursor: (text: ApiFormattedText) => void,
  setAttachments: (attachments: ApiAttachment[] | ((current: ApiAttachment[]) => ApiAttachment[])) => void,
  editedMessage: MaybeAccessor<ApiMessage | undefined>,
  resolveFilePasteTarget: () => ClipboardFilePasteTarget,
  shouldUpdateAttachmentCompression?: MaybeAccessor<boolean | undefined>,
  shouldSkipFilePaste?: MaybeAccessor<boolean | undefined>,
  onRichMediaFiles?: RichEditorMediaFilesHandler,
  getRichMediaPosition?: () => number | undefined,
) => {
  const { showNotification, updateShouldSaveAttachmentsCompression, applyDefaultAttachmentsCompression } = getActions();
  const lang = useLang();

  createEffect(
    depsOf(
      () =>
        [
          read(isActive),
          read(editedMessage),
          read(shouldUpdateAttachmentCompression),
          read(shouldSkipFilePaste),
        ] as const,
    ),
    ([isActive2, editedMessage2, shouldUpdateAttachmentCompression2, shouldSkipFilePaste2]) => {
      if (!isActive2) {
        return undefined;
      }

      async function handlePaste(e: ClipboardEvent) {
        if (!e.clipboardData) {
          return;
        }

        const input = (e.target as HTMLElement)?.closest(CLOSEST_CONTENT_EDITABLE_SELECTOR);
        if (!input || !VALID_TARGET_IDS.has(input.id)) {
          return;
        }

        // Some extensions can trigger paste into their panels without focus
        if (document.activeElement !== input) {
          return;
        }

        const { items } = e.clipboardData;
        const hasFiles = Array.from(items).some((item) => item.kind === 'file');
        if (!hasFiles) {
          return;
        }

        const filePasteTarget = resolveFilePasteTarget();
        const richMediaPosition = filePasteTarget === 'richMedia' ? getRichMediaPosition?.() : undefined;
        e.preventDefault();
        if (filePasteTarget === 'none') {
          return;
        }

        let files = await getFilesFromDataTransferItems(items);
        if (!files?.length) {
          return;
        }

        if (filePasteTarget === 'richMedia') {
          onRichMediaFiles?.(files, richMediaPosition);
          return;
        }

        if (editedMessage2) {
          files = files.slice(0, 1);
        }

        const pastedText = e.clipboardData.getData('text');
        const textToPaste: ApiFormattedText | undefined = pastedText ? { text: pastedText } : undefined;
        const hasText = textToPaste && textToPaste.text;
        let shouldSetAttachments = files?.length && !shouldSkipFilePaste2;

        const newAttachments = files ? await Promise.all(files.map((file) => buildAttachment(file.name, file))) : [];
        const canReplace =
          (editedMessage2 && newAttachments?.length && canReplaceMessageMedia(editedMessage2, newAttachments[0])) ||
          Boolean(hasText);
        const isUploadingDocumentSticker = isUploadingFileSticker(newAttachments[0]);
        const isInAlbum = editedMessage2 && editedMessage2?.groupedId;

        if (editedMessage2 && newAttachments?.length > 1) {
          newAttachments.forEach((attachment) => revokeAttachmentUrls(attachment));
          showNotification({
            message: lang('MediaReplaceInvalidError', undefined, { pluralValue: newAttachments.length }),
          });
          return;
        }

        if (editedMessage2 && isUploadingDocumentSticker) {
          newAttachments.forEach((attachment) => revokeAttachmentUrls(attachment));
          showNotification({ message: lang('MediaReplaceInvalidError', undefined, { pluralValue: 1 }) });
          return;
        }

        if (isInAlbum) {
          shouldSetAttachments = canReplace;
          if (!shouldSetAttachments) {
            newAttachments.forEach((attachment) => revokeAttachmentUrls(attachment));
            showNotification({
              message: lang('MediaReplaceInvalidError', undefined, { pluralValue: newAttachments.length }),
            });
            return;
          }
        }

        if (shouldSetAttachments) {
          if (shouldUpdateAttachmentCompression2) {
            updateShouldSaveAttachmentsCompression({ shouldSave: true });
            applyDefaultAttachmentsCompression();
          }
          setAttachments(editedMessage2 ? newAttachments : (attachments) => attachments.concat(newAttachments));
        } else {
          newAttachments.forEach((attachment) => revokeAttachmentUrls(attachment));
        }

        if (hasText) {
          insertTextAndUpdateCursor(textToPaste);
        }
      }

      document.addEventListener('paste', handlePaste, true);

      return () => {
        document.removeEventListener('paste', handlePaste, true);
      };
    },
  );
};

export default useClipboardPaste;
