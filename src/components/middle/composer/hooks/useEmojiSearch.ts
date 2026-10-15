import { createEffect, createMemo, createSignal, untrack } from 'frameact';
import { unwrap } from 'frameact/store';
import { getActions, getGlobal } from '../../../../global';

import type { ApiEmojiGroup, ApiSticker, ApiStickerSet } from '../../../../api/types';

import { selectCustomEmojiForEmojis } from '../../../../global/selectors';
import { selectSharedSettings } from '../../../../global/selectors/sharedState';
import { type MaybeAccessor, read } from '../../../../util/accessors';
import { depsOf } from '../../../../util/effectDeps';
import { ensureEmojiData, prepareEmojiLibraryMemo, searchEmojiLibraryMemo } from '../../../../util/emoji/emojiSearch';
import { buildCollectionByKey, uniqueByField } from '../../../../util/iteratees';
import { throttle } from '../../../../util/schedulers';
import searchWords from '../../../../util/searchWords';
import { callApi } from '../../../../api/gramjs';

import useFlag from '../../../../hooks/useFlag';

export type EmojiQueryResults = {
  key: string;
  intent: string;
  emoticon?: string;
  packSets?: ApiStickerSet[];
  globalStickers?: ApiSticker[];
  globalNextOffset?: number;
};

type GroupResults = {
  groupTitle: string;
  customEmojiIds?: string[];
};

const EMOJI_SEARCH_LIMIT = 40;
const SEARCH_THROTTLE = 500;
const VARIATION_SELECTOR = '\uFE0F';

// Deviation: the options are `MaybeAccessor`s and the reactive results are accessors (a hook runs once), the actions
// are plain functions. `displayGroup` is a memo that holds the group of the last finished load (tt kept it in a ref).
export default function useEmojiSearch({
  allEmojis,
  baseEmojiKeywords,
  emojiKeywords,
  localStickers,
  isLocalOnly,
  noNativeResults,
  noQueryCustomResults,
}: {
  allEmojis?: MaybeAccessor<Record<string, Emoji> | undefined>;
  baseEmojiKeywords?: MaybeAccessor<Record<string, string[]> | undefined>;
  emojiKeywords?: MaybeAccessor<Record<string, string[]> | undefined>;
  localStickers?: MaybeAccessor<ApiSticker[] | undefined>;
  isLocalOnly?: MaybeAccessor<boolean | undefined>;
  noNativeResults?: MaybeAccessor<boolean | undefined>;
  noQueryCustomResults?: MaybeAccessor<boolean | undefined>;
}) {
  const [query, setQuery] = createSignal('');
  const [activeGroup, setActiveGroup] = createSignal<ApiEmojiGroup | undefined>(undefined);
  const [isFocused, markFocused, unmarkFocused] = useFlag();
  const [loadedEmojis, setLoadedEmojis] = createSignal<Record<string, Emoji> | undefined>(undefined);
  const [queryResults, setQueryResults] = createSignal<EmojiQueryResults | undefined>(undefined);
  const [groupResults, setGroupResults] = createSignal<GroupResults | undefined>(undefined);

  let searchIntentRef: string | undefined;
  let activeGroupTitleRef: string | undefined;
  let loadingMoreIntentRef: string | undefined;
  const runThrottledSearch = throttle((cb: NoneToVoidFunction) => cb(), SEARCH_THROTTLE, false);

  const effectiveEmojis = createMemo(() => read(allEmojis) || loadedEmojis());

  const preparedQuery = createMemo(() => query().trim().toLowerCase());
  const hasQuery = createMemo(() => Boolean(preparedQuery()));
  const isSearchActive = createMemo(() => isFocused() || hasQuery() || Boolean(activeGroup()));

  createEffect(
    depsOf(() => [isSearchActive(), effectiveEmojis()] as const),
    ([isSearchActive2, effectiveEmojis2]) => {
      if (!isSearchActive2 || effectiveEmojis2) {
        return;
      }

      ensureEmojiData()
        .then((data) => setLoadedEmojis(data.emojis))
        .catch(() => undefined);
    },
  );

  const isGroupLoading = createMemo(
    () => Boolean(activeGroup()) && !read(isLocalOnly) && groupResults()?.groupTitle !== activeGroup()!.title,
  );
  let displayResultsRef: { group: ApiEmojiGroup; customIds?: string[] } | undefined;
  const displayResults = createMemo(() => {
    const group = activeGroup();
    if (!group) {
      displayResultsRef = undefined;
    } else if (!isGroupLoading()) {
      displayResultsRef = {
        group,
        customIds: !read(isLocalOnly) ? groupResults()?.customEmojiIds : undefined,
      };
    }
    return displayResultsRef;
  });
  const displayGroup = createMemo(() => displayResults()?.group);

  const isShowingResults = createMemo(() => hasQuery() || Boolean(displayGroup()));

  const emojisByNative = createMemo(() => {
    const effectiveEmojis2 = effectiveEmojis();
    return effectiveEmojis2 && buildCollectionByKey(Object.values(effectiveEmojis2), 'native');
  });

  const matchedNatives = createMemo(() => {
    const effectiveEmojis2 = effectiveEmojis();
    if (!effectiveEmojis2) {
      return undefined;
    }

    const preparedQuery2 = preparedQuery();
    if (preparedQuery2) {
      // Deviation: the keyword maps come from the store; `memoized` recomputes for a proxy argument, and building the
      // library through proxies would track every keyword, so the raw objects are used (they are loaded once, as a whole).
      const baseEmojiKeywords2 = read(baseEmojiKeywords);
      const emojiKeywords2 = read(emojiKeywords);
      return untrack(() => {
        const library = prepareEmojiLibraryMemo(
          effectiveEmojis2,
          baseEmojiKeywords2 && unwrap(baseEmojiKeywords2),
          emojiKeywords2 && unwrap(emojiKeywords2),
        );
        return searchEmojiLibraryMemo(library, preparedQuery2, EMOJI_SEARCH_LIMIT);
      });
    }

    const displayGroup2 = displayGroup();
    const emojisByNative2 = emojisByNative();
    if (displayGroup2 && emojisByNative2) {
      return displayGroup2.emoticons
        .map((emoticon) => emojisByNative2[emoticon] || emojisByNative2[emoticon.replace(VARIATION_SELECTOR, '')])
        .filter(Boolean);
    }

    return undefined;
  });

  const emoticon = createMemo(() =>
    hasQuery()
      ? matchedNatives()
          ?.map((emoji) => emoji.native)
          .join('')
      : undefined,
  );

  createEffect(
    depsOf(() => [read(isLocalOnly), preparedQuery(), emoticon()] as const),
    ([isLocalOnly2, preparedQuery2, emoticon2]) => {
      if (isLocalOnly2) {
        return;
      }

      if (!preparedQuery2) {
        searchIntentRef = undefined;
        setQueryResults(undefined);
        return;
      }

      const intent = `${preparedQuery2}\u0000${emoticon2 || ''}`;
      searchIntentRef = intent;

      runThrottledSearch(async () => {
        if (searchIntentRef !== intent) {
          return;
        }

        const langCode = selectSharedSettings(getGlobal()).language;
        const [setsResult, globalResult] = await Promise.all([
          callApi('searchEmojiStickerSets', { query: preparedQuery2 }),
          callApi('searchStickersGlobal', {
            query: preparedQuery2,
            emoticon: emoticon2,
            langCode,
            isEmoji: true,
          }),
        ]);

        if (searchIntentRef !== intent) {
          return;
        }

        const packSets = setsResult ? [...setsResult.sets] : [];
        const packIdsSet = new Set(packSets.map(({ id }) => id));
        const global = getGlobal();
        global.customEmojis.added.setIds?.forEach((id) => {
          if (packIdsSet.has(id)) {
            return;
          }

          const addedSet = global.stickers.setsById[id];
          if (addedSet?.title && searchWords(addedSet.title, preparedQuery2)) {
            packSets.unshift(addedSet);
          }
        });

        setQueryResults({
          key: preparedQuery2,
          intent,
          emoticon: emoticon2,
          packSets,
          globalStickers: globalResult?.stickers || [],
          globalNextOffset: globalResult?.nextOffset,
        });
      });
    },
  );

  const searchMore = () => {
    const results = queryResults();
    if (
      read(isLocalOnly) ||
      !results ||
      results.intent !== searchIntentRef ||
      results.globalNextOffset === undefined ||
      loadingMoreIntentRef === results.intent
    ) {
      return;
    }

    loadingMoreIntentRef = results.intent;

    void (async () => {
      try {
        const langCode = selectSharedSettings(getGlobal()).language;
        const globalResult = await callApi('searchStickersGlobal', {
          query: results.key,
          emoticon: results.emoticon,
          langCode,
          offset: results.globalNextOffset,
          isEmoji: true,
        });
        if (!globalResult) {
          return;
        }

        setQueryResults((prev) => {
          if (!prev || prev.intent !== results.intent) {
            return prev;
          }

          const currentIds = new Set((prev.globalStickers || []).map(({ id }) => id));

          return {
            ...prev,
            globalStickers: [
              ...(prev.globalStickers || []),
              ...globalResult.stickers.filter(({ id }) => !currentIds.has(id)),
            ],
            globalNextOffset: globalResult.nextOffset,
          };
        });
      } finally {
        if (loadingMoreIntentRef === results.intent) {
          loadingMoreIntentRef = undefined;
        }
      }
    })();
  };

  const customResults = createMemo(() => {
    const preparedQuery2 = preparedQuery();
    const displayGroup2 = displayGroup();
    const searchedNatives = preparedQuery2 ? matchedNatives()?.map((emoji) => emoji.native) : displayGroup2?.emoticons;
    if (!searchedNatives?.length) {
      return undefined;
    }

    if (read(isLocalOnly)) {
      const nativesSet = new Set(searchedNatives.map((native) => native.replace(VARIATION_SELECTOR, '')));
      return uniqueByField(
        (read(localStickers) || []).filter(
          ({ emoji }) => emoji && nativesSet.has(emoji.replace(VARIATION_SELECTOR, '')),
        ),
        'id',
      );
    }

    if (preparedQuery2 && read(noQueryCustomResults)) {
      return undefined;
    }

    // Deviation: `getGlobal()` (not tracked), as in tt: the memo depends on the same values as tt's `useMemo`; the
    // global is read when they change, and a tracked read would subscribe to every pack of every added set.
    return uniqueByField(selectCustomEmojiForEmojis(getGlobal(), searchedNatives), 'id');
  });

  const customResultIds = createMemo(() =>
    !hasQuery() && !read(isLocalOnly) ? displayResults()?.customIds : undefined,
  );

  const nativeResults = createMemo(() => (read(noNativeResults) ? undefined : matchedNatives()));

  const selectGroup = (group?: ApiEmojiGroup) => {
    setActiveGroup(group);
    activeGroupTitleRef = group?.title;

    if (read(isLocalOnly) || !group) {
      return;
    }

    void (async () => {
      const result = await callApi('searchCustomEmojiByEmoticons', { emoticons: group.emoticons });
      if (activeGroupTitleRef !== group.title) {
        return;
      }

      const customEmojiIds = result?.documentIds || [];
      setGroupResults({ groupTitle: group.title, customEmojiIds });

      if (customEmojiIds.length) {
        getActions().loadCustomEmojis({ ids: customEmojiIds });
      }
    })();
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);

    if (value.trim() && activeGroup()) {
      selectGroup(undefined);
    }
  };

  return {
    query,
    hasQuery,
    activeGroup,
    displayGroup,
    isSearchActive,
    isShowingResults,
    nativeResults,
    customResults,
    customResultIds,
    queryResults,
    setQuery: handleQueryChange,
    selectGroup,
    searchMore,
    markSearchFocused: markFocused,
    unmarkSearchFocused: unmarkFocused,
  };
}
