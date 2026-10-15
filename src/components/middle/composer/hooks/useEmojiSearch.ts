import { createEffect, createMemo, createSignal, onMount } from 'frameact';
import { getActions, getGlobal } from '../../../../global';
import { depsOf } from '../../../../util/effectDeps';

import type { ApiEmojiGroup, ApiSticker, ApiStickerSet } from '../../../../api/types';

import { selectCustomEmojiForEmojis } from '../../../../global/selectors';
import { selectSharedSettings } from '../../../../global/selectors/sharedState';
import { ensureEmojiData, prepareEmojiLibraryMemo, searchEmojiLibraryMemo } from '../../../../util/emoji/emojiSearch';
import { buildCollectionByKey, uniqueByField } from '../../../../util/iteratees';
import { throttle } from '../../../../util/schedulers';
import searchWords from '../../../../util/searchWords';
import { callApi } from '../../../../api/gramjs';

import useFlag from '../../../../hooks/useFlag';

type EmojiQueryResults = {
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

// TODO(codemod): useEmojiSearch: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useEmojiSearch({
  allEmojis,
  baseEmojiKeywords,
  emojiKeywords,
  localStickers,
  isLocalOnly,
  noNativeResults,
  noQueryCustomResults,
}: {
  allEmojis?: Record<string, Emoji>;
  baseEmojiKeywords?: Record<string, string[]>;
  emojiKeywords?: Record<string, string[]>;
  localStickers?: ApiSticker[];
  isLocalOnly?: boolean;
  noNativeResults?: boolean;
  noQueryCustomResults?: boolean;
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
  let runThrottledSearchRef: (cb: NoneToVoidFunction) => void | undefined;
  runThrottledSearchRef ??= throttle((cb: NoneToVoidFunction) => cb(), SEARCH_THROTTLE, false);

  const effectiveEmojis = createMemo(() => allEmojis || loadedEmojis());

  const preparedQuery = createMemo(() => query().trim().toLowerCase());
  const hasQuery = createMemo(() => Boolean(preparedQuery()));
  const isSearchActive = createMemo(() => isFocused() || hasQuery() || Boolean(activeGroup()));

  onMount(() => {
    if (!isSearchActive() || effectiveEmojis()) {
      return;
    }

    ensureEmojiData()
      .then((data) => setLoadedEmojis(data.emojis))
      .catch(() => undefined);
  });

  const isGroupLoading = createMemo(
    () => Boolean(activeGroup()) && !isLocalOnly && groupResults()?.groupTitle !== activeGroup().title,
  );
  let displayResultsRef: { group: ApiEmojiGroup; customIds?: string[] } | undefined;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (!activeGroup()) {
    displayResultsRef = undefined;
  } else if (!isGroupLoading()) {
    displayResultsRef = {
      group: activeGroup(),
      customIds: !isLocalOnly ? groupResults()?.customEmojiIds : undefined,
    };
  }
  const displayGroup = displayResultsRef?.group;

  const isShowingResults = createMemo(() => hasQuery() || Boolean(displayGroup));

  const emojisByNative = createMemo(() => {
    return effectiveEmojis() && buildCollectionByKey(Object.values(effectiveEmojis()), 'native');
  });

  const matchedNatives = createMemo(() => {
    if (!effectiveEmojis()) {
      return undefined;
    }

    if (preparedQuery()) {
      const library = prepareEmojiLibraryMemo(effectiveEmojis(), baseEmojiKeywords, emojiKeywords);
      return searchEmojiLibraryMemo(library, preparedQuery(), EMOJI_SEARCH_LIMIT);
    }

    if (displayGroup && emojisByNative()) {
      return displayGroup.emoticons
        .map((emoticon) => emojisByNative()[emoticon] || emojisByNative()[emoticon.replace(VARIATION_SELECTOR, '')])
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
    depsOf(() => [isLocalOnly, preparedQuery(), emoticon()] as const),
    ([, , emoticon2]) => {
      if (isLocalOnly) {
        return;
      }

      if (!preparedQuery()) {
        searchIntentRef = undefined;
        setQueryResults(undefined);
        return;
      }

      const intent = `${preparedQuery()}\u0000${emoticon2 || ''}`;
      searchIntentRef = intent;

      runThrottledSearchRef!(async () => {
        if (searchIntentRef !== intent) {
          return;
        }

        const langCode = selectSharedSettings(getGlobal()).language;
        const [setsResult, globalResult] = await Promise.all([
          callApi('searchEmojiStickerSets', { query: preparedQuery() }),
          callApi('searchStickersGlobal', {
            query: preparedQuery(),
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
          if (addedSet?.title && searchWords(addedSet.title, preparedQuery())) {
            packSets.unshift(addedSet);
          }
        });

        setQueryResults({
          key: preparedQuery(),
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
      isLocalOnly ||
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
    const searchedNatives = preparedQuery() ? matchedNatives()?.map((emoji) => emoji.native) : displayGroup?.emoticons;
    if (!searchedNatives?.length) {
      return undefined;
    }

    if (isLocalOnly) {
      const nativesSet = new Set(searchedNatives.map((native) => native.replace(VARIATION_SELECTOR, '')));
      return uniqueByField(
        (localStickers || []).filter(({ emoji }) => emoji && nativesSet.has(emoji.replace(VARIATION_SELECTOR, ''))),
        'id',
      );
    }

    if (preparedQuery() && noQueryCustomResults) {
      return undefined;
    }

    // TODO(codemod): getGlobal() in a memo / JSX is a one-time read: use useGlobal() (store contract §12.4)
    return uniqueByField(selectCustomEmojiForEmojis(getGlobal(), searchedNatives), 'id');
  });

  const customResultIds = createMemo(() => (!hasQuery() && !isLocalOnly ? displayResultsRef?.customIds : undefined));

  const nativeResults = createMemo(() => (noNativeResults ? undefined : matchedNatives()));

  const selectGroup = (group?: ApiEmojiGroup) => {
    setActiveGroup(group);
    activeGroupTitleRef = group?.title;

    if (isLocalOnly || !group) {
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
    hasQuery: hasQuery(),
    activeGroup,
    displayGroup,
    isSearchActive: isSearchActive(),
    isShowingResults: isShowingResults(),
    nativeResults: nativeResults(),
    customResults,
    customResultIds: customResultIds(),
    queryResults,
    setQuery: handleQueryChange,
    selectGroup,
    searchMore,
    markSearchFocused: markFocused,
    unmarkSearchFocused: unmarkFocused,
  };
}
