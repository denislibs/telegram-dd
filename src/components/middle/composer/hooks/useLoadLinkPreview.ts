import { createEffect, createSignal } from 'frameact';
import { getActions } from '../../../../global';

import type { ThreadId } from '../../../../types';
import {
  type ApiFormattedText,
  type ApiInputRichMessage,
  type ApiMessageEntityTextUrl,
  ApiMessageEntityTypes,
} from '../../../../api/types';

import { RE_LINK_TEMPLATE } from '../../../../config';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { depsOf } from '../../../../util/effectDeps';
import { getRichInputAsFormatted } from '../../../ui/textInput/richText';

import { useDebouncedResolver } from '../../../../hooks/useAsyncResolvers';

const DEBOUNCE_MS = 300;
const RE_LINK = new RegExp(RE_LINK_TEMPLATE, 'i');

// Deviation: a hook runs once; the parameters that can change are values or accessors (`read`). tt's `useSyncEffect` (it ran
// during the render that changed the chat) is an effect declared before the link one, so that they keep their order. tt's
// async `useDerivedSignal` is an effect that runs the debounced resolver into a signal.
export default function useLoadLinkPreview({
  richMessage,
  chatId,
  threadId,
}: {
  chatId: MaybeAccessor<string>;
  threadId: MaybeAccessor<ThreadId>;
  richMessage?: MaybeAccessor<ApiInputRichMessage | undefined>;
}) {
  const { loadWebPagePreview, clearWebPagePreview, toggleMessageWebPage } = getActions();

  let formattedTextWithLinkRef: ApiFormattedText | undefined;

  const detectLinkDebounced = useDebouncedResolver(
    () => {
      const richMessage2 = read(richMessage);
      const formattedText = richMessage2 ? getRichInputAsFormatted(richMessage2) || { text: '' } : { text: '' };
      const linkEntity = formattedText.entities?.find(
        (entity): entity is ApiMessageEntityTextUrl => entity.type === ApiMessageEntityTypes.TextUrl,
      );

      formattedTextWithLinkRef = formattedText;

      return linkEntity?.url || formattedText.text.match(RE_LINK)?.[0];
    },
    [],
    DEBOUNCE_MS,
    true,
  );

  const [getLink, setLink] = createSignal<string | undefined>(undefined);

  createEffect(
    () => read(richMessage),
    () => detectLinkDebounced(setLink),
  );

  createEffect(
    depsOf(() => [read(chatId), read(threadId)] as const),
    ([chatId2, threadId2]) => {
      clearWebPagePreview();
      toggleMessageWebPage({ chatId: chatId2, threadId: threadId2 });
    },
  );

  createEffect(
    depsOf(() => [getLink(), read(chatId), read(threadId)] as const),
    ([link, chatId2, threadId2]) => {
      const formattedText = formattedTextWithLinkRef;

      if (link) {
        loadWebPagePreview({ text: formattedText! });
      } else {
        clearWebPagePreview();
        toggleMessageWebPage({ chatId: chatId2, threadId: threadId2 });
      }
    },
  );
}
