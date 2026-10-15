import { createEffect, createMemo } from 'frameact';
import { getActions } from '../../../../global';
import { depsOf } from '../../../../util/effectDeps';

import type { ThreadId } from '../../../../types';
import {
  type ApiFormattedText,
  type ApiInputRichMessage,
  type ApiMessageEntityTextUrl,
  ApiMessageEntityTypes,
} from '../../../../api/types';

import { RE_LINK_TEMPLATE } from '../../../../config';
import { getRichInputAsFormatted } from '../../../ui/textInput/richText';

import { useDebouncedResolver } from '../../../../hooks/useAsyncResolvers';

const DEBOUNCE_MS = 300;
const RE_LINK = new RegExp(RE_LINK_TEMPLATE, 'i');

// TODO(codemod): useLoadLinkPreview: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useLoadLinkPreview({
  richMessage,
  chatId,
  threadId,
}: {
  chatId: string;
  threadId: ThreadId;
  richMessage?: ApiInputRichMessage;
}) {
  const { loadWebPagePreview, clearWebPagePreview, toggleMessageWebPage } = getActions();

  let formattedTextWithLinkRef: ApiFormattedText | undefined;

  const detectLinkDebounced = useDebouncedResolver(
    () => {
      const formattedText = richMessage ? getRichInputAsFormatted(richMessage) || { text: '' } : { text: '' };
      const linkEntity = formattedText.entities?.find(
        (entity): entity is ApiMessageEntityTextUrl => entity.type === ApiMessageEntityTypes.TextUrl,
      );

      formattedTextWithLinkRef = formattedText;

      return linkEntity?.url || formattedText.text.match(RE_LINK)?.[0];
    },
    [richMessage],
    DEBOUNCE_MS,
    true,
  );

  const getLink = createMemo(detectLinkDebounced);

  createEffect(
    depsOf(() => [getLink(), chatId, threadId] as const),
    ([getLink2]) => {
      const link = getLink2();
      const formattedText = formattedTextWithLinkRef;

      if (link) {
        loadWebPagePreview({ text: formattedText! });
      } else {
        clearWebPagePreview();
        toggleMessageWebPage({ chatId, threadId });
      }
    },
  );

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    depsOf(() => [chatId, clearWebPagePreview, threadId, toggleMessageWebPage]),
    () => {
      clearWebPagePreview();
      toggleMessageWebPage({ chatId, threadId });
    },
  );
}
