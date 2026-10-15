import {
  type Accessor,
  createEffect,
  createMeasureEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  frozenWhile,
  onDestroy,
  onMount,
  requestMeasure,
  untrack,
} from 'frameact';
import { For, Show } from 'frameact/dom';
import { getActions, useGlobal, withGlobal } from '../../../global';

import type { ApiEmojiGroup, ApiSticker, ApiStickerSet } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { TransitionSlide } from '../../../lib/kit';
import type { StickerSetOrReactionsSetOrRecent } from '../../../types';
import type { IconName } from '../../../types/icons';
import type { EmojiData } from '../../../util/emoji/emoji';
import type { PillCategory } from './EmojiCategoryPill';

import {
  BASE_EMOJI_KEYWORD_LANG,
  EMOJI_SIZE_PICKER,
  MENU_TRANSITION_DURATION,
  RECENT_SYMBOL_SET_ID,
  SLIDE_TRANSITION_DURATION,
} from '../../../config';
import {
  selectCanPlayAnimatedEmojis,
  selectChatFullInfo,
  selectCustomEmojiForEmojis,
  selectIsChatWithSelf,
  selectIsCurrentUserPremium,
  selectIsSetPremium,
} from '../../../global/selectors';
import { selectSharedSettings } from '../../../global/selectors/sharedState';
import animateHorizontalScroll from '../../../util/animateHorizontalScroll';
import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';
import { ensureEmojiData } from '../../../util/emoji/emojiSearch';
import { pickTruthy, unique, uniqueByField } from '../../../util/iteratees';
import { MEMO_EMPTY_ARRAY } from '../../../util/memo';
import resetScroll from '../../../util/resetScroll';
import { REM } from '../../common/helpers/mediaDimensions';

import { useTransitionActiveKey } from '../../../hooks/animations/useTransitionActiveKey';
import useAppLayout from '../../../hooks/useAppLayout';
import useHorizontalScroll from '../../../hooks/useHorizontalScroll';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';
import useOldLang from '../../../hooks/useOldLang';
import useScrolledState from '../../../hooks/useScrolledState';
import { useStickerPickerObservers } from '../../common/hooks/useStickerPickerObservers';
import useAsyncRendering from '../../right/hooks/useAsyncRendering';
import useEmojiSearch, { type EmojiQueryResults } from './hooks/useEmojiSearch';

import EmojiSearchResults from '../../common/EmojiSearchResults';
import Icon from '../../common/icons/Icon';
import InlineStickerSetView, { StickerSetToggleButton } from '../../common/InlineStickerSetView';
import StickerButton from '../../common/StickerButton';
import StickerSet from '../../common/StickerSet';
import Button from '../../ui/Button';
import Loading from '../../ui/Loading';
import Transition from '../../ui/Transition';
import EmojiCategory from './EmojiCategory';
import EmojiCategoryPill from './EmojiCategoryPill';
import EmojiSearch from './EmojiSearch';
import StickerSetCover from './StickerSetCover';

import './EmojiPicker.scss';

type OwnProps = {
  chatId?: string;
  className?: string;
  isHidden?: boolean;
  loadAndPlay?: boolean;
  idPrefix?: string;
  isTranslucent?: boolean;
  onEmojiSelect: (emoji: string, name: string) => void;
  onCustomEmojiSelect: (emoji: ApiSticker) => void;
};

type StateProps = {
  recentEmojis: string[];
  baseEmojiKeywords?: Record<string, string[]>;
  emojiKeywords?: Record<string, string[]>;
  customEmojisById?: Record<string, ApiSticker>;
  recentCustomEmojiIds?: string[];
  stickerSetsById: Record<string, ApiStickerSet>;
  addedCustomEmojiIds?: string[];
  customEmojiFeaturedIds?: string[];
  chatEmojiSetId?: string;
  canAnimate?: boolean;
  isSavedMessages?: boolean;
  isCurrentUserPremium?: boolean;
  emojiGroups?: ApiEmojiGroup[];
};

type EmojiCategoryData = { id: string; name: string; emojis: string[] };

type EmojiSection =
  | { type: 'category'; category: EmojiCategoryData; title: string }
  | { type: 'set'; set: StickerSetOrReactionsSetOrRecent; isChatEmojiSet?: boolean };

const ICONS_BY_CATEGORY: Record<string, IconName> = {
  people: 'smile',
  nature: 'animals',
  foods: 'eats',
  activity: 'sport',
  places: 'car',
  objects: 'lamp',
  symbols: 'language',
  flags: 'flag',
};

const OPEN_ANIMATION_DELAY = 200;
const COVER_SIZE = 1.75 * REM;
const PILL_EXPANDED_WIDTH = 10 * REM;
const INTERSECTION_THROTTLE = 200;
const LOAD_MORE_THRESHOLD = 500;
const DEFAULT_ID_PREFIX = 'emoji-picker';

type TextResults = {
  key: string;
  natives?: Emoji[];
  localCustom?: ApiSticker[];
  packSets?: ApiStickerSet[];
  globalStickers?: ApiSticker[];
};

// Deviation: tt's `usePrevDuringAnimation` is deleted (the framework table maps it to `frozenWhile` / `currentOrPrev`,
// which do not know the "hold for `duration` ms after the value became empty" rule); `MiddleColumn` has the same helper.
// While `source` is empty and a value was present before it, that value is held for `duration` ms.
function createValueHeldWhileEmpty<T>(source: Accessor<T | undefined>, duration: number): Accessor<T | undefined> {
  const [expiry, bumpExpiry] = createSignal(0);
  let timer: number | undefined;
  let held: T | undefined;
  let phase: 'idle' | 'holding' | 'expired' = 'idle';

  onDestroy(() => {
    window.clearTimeout(timer);
  });

  return createMemo(() => {
    expiry();
    const current = source();

    // eslint-disable-next-line no-null/no-null
    if (current !== undefined && current !== null) {
      window.clearTimeout(timer);
      timer = undefined;
      phase = 'idle';
      held = current;
      return current;
    }

    // eslint-disable-next-line no-null/no-null
    if (phase === 'idle' && held !== undefined && held !== null) {
      phase = 'holding';
      timer = window.setTimeout(() => {
        timer = undefined;
        phase = 'expired';
        bumpExpiry((value) => value + 1);
      }, duration);
    }

    return phase === 'holding' ? held : current;
  });
}

const EmojiPicker = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { loadStickers } = getActions();
  const global = useGlobal();

  // The elements are created inside a `Transition` slide, long after this body ran. The hooks that read them when they
  // apply (the intersection observers) get these accessors; `useHorizontalScroll` reads its ref in the first compute,
  // so it gets a signal that the slide fills in `onMount` (a write from the ref callback would dirty the measure effect
  // of the hook from the mutate phase, where slides are created).
  let containerEl: HTMLDivElement | undefined;
  let headerEl: HTMLDivElement | undefined;
  const getContainer = () => containerEl;
  const getHeader = () => headerEl;
  const [headerRef, setHeaderRef] = createSignal<HTMLDivElement | undefined>(undefined);

  const [categories, setCategories] = createSignal<EmojiCategoryData[] | undefined>(undefined);
  const [emojis, setEmojis] = createSignal<EmojiData['emojis'] | undefined>(undefined);
  const { isMobile } = useAppLayout();
  const { handleScroll: handleContentScroll, isAtBeginning: shouldHideTopBorder } = useScrolledState();

  const {
    query,
    hasQuery,
    activeGroup,
    displayGroup,
    isSearchActive,
    nativeResults,
    customResults,
    customResultIds,
    queryResults,
    setQuery,
    selectGroup,
    searchMore,
    markSearchFocused,
    unmarkSearchFocused,
  } = useEmojiSearch({
    allEmojis: emojis,
    baseEmojiKeywords: () => props.baseEmojiKeywords,
    emojiKeywords: () => props.emojiKeywords,
    noQueryCustomResults: true,
  });

  const trimmedQuery = createMemo(() => query().trim().toLowerCase());

  let textResultsRef: TextResults | undefined;
  const currentQueryResults = createMemo((): EmojiQueryResults | undefined => {
    const queryResults2 = queryResults();
    return queryResults2?.key === trimmedQuery() ? queryResults2 : undefined;
  });
  // Deviation: tt kept the last results in a ref that the render updated; here a memo updates it when its inputs change.
  const textResults = createMemo(() => {
    if (hasQuery() && (nativeResults() !== undefined || currentQueryResults())) {
      const nativeResults2 = nativeResults();
      textResultsRef = {
        key: trimmedQuery(),
        natives: nativeResults2,
        localCustom: nativeResults2
          ? uniqueByField(
              selectCustomEmojiForEmojis(
                global,
                nativeResults2.map(({ native }) => native),
              ),
              'id',
            )
          : undefined,
        // Full sets loaded on demand (e.g. for covers) land in `stickerSetsById`, so prefer them over search snapshots
        packSets: currentQueryResults()?.packSets?.map((set) => props.stickerSetsById[set.id] || set),
        globalStickers: currentQueryResults()?.globalStickers,
      };
    }

    return hasQuery() ? textResultsRef : undefined;
  });
  const isShowingResults = createMemo(() => (displayGroup() ? true : Boolean(textResults())));
  const isSearchLoading = createMemo(() => hasQuery() && !currentQueryResults());

  const [openedPack, setOpenedPack] = createSignal<ApiStickerSet | undefined>(undefined);
  const [isLocalSectionCollapsed, setIsLocalSectionCollapsed] = createSignal(false);
  const [isGlobalSectionCollapsed, setIsGlobalSectionCollapsed] = createSignal(false);

  // Deviation: tt reset the flags with `useSyncEffect` (during the render in which the query changed); this is a tickEnd
  // effect.
  createEffect(
    () => trimmedQuery(),
    () => {
      setIsLocalSectionCollapsed(false);
      setIsGlobalSectionCollapsed(false);
    },
  );
  const openedSet = createMemo(() => {
    const openedPack2 = openedPack();
    return openedPack2 && (props.stickerSetsById[openedPack2.id] || openedPack2);
  });

  const contentActiveKey = useTransitionActiveKey(() => [
    isShowingResults(),
    displayGroup()?.title,
    textResults()?.key,
    openedSet()?.id,
  ]);

  const prefix = createMemo(() => `${props.idPrefix === undefined ? DEFAULT_ID_PREFIX : props.idPrefix}-emoji-section`);
  const {
    activeSetIndex,
    observeIntersectionForSet,
    observeIntersectionForPlayingItems,
    observeIntersectionForShowingItems,
    observeIntersectionForCovers,
    selectStickerSet: selectSection,
  } = useStickerPickerObservers(getContainer, getHeader, prefix, () => props.isHidden);

  const { observe: observeIntersectionForResults } = useIntersectionObserver({
    rootRef: getContainer,
    throttleMs: INTERSECTION_THROTTLE,
  });

  createMutationEffect(
    depsOf(() => [isShowingResults(), displayGroup(), textResults()?.key, openedSet()?.id] as const),
    () => {
      if (containerEl) {
        resetScroll(containerEl, 0);
      }
    },
  );

  const canLoadAndPlay = createValueHeldWhileEmpty(() => props.loadAndPlay || undefined, SLIDE_TRANSITION_DURATION);

  const canRenderContents = useAsyncRendering([], MENU_TRANSITION_DURATION);
  const shouldRenderContent = createMemo(() => Boolean(emojis() && canRenderContents()));

  useHorizontalScroll(headerRef, () => isMobile() || !shouldRenderContent());

  const oldLang = useOldLang();

  const customSets = createMemo(() => {
    const defaultSets: StickerSetOrReactionsSetOrRecent[] = [];

    if (props.isCurrentUserPremium || props.isSavedMessages) {
      const recentCustomEmojis =
        props.customEmojisById && props.recentCustomEmojiIds
          ? Object.values(pickTruthy(props.customEmojisById, props.recentCustomEmojiIds))
          : undefined;
      if (recentCustomEmojis?.length) {
        defaultSets.push({
          id: RECENT_SYMBOL_SET_ID,
          accessHash: '0',
          title: oldLang('RecentStickers'),
          stickers: recentCustomEmojis,
          count: recentCustomEmojis.length,
          isEmoji: true,
        });
      }
    }

    const userSetIds = [...(props.addedCustomEmojiIds || [])];
    if (props.chatEmojiSetId) {
      userSetIds.unshift(props.chatEmojiSetId);
    }

    const setIdsToDisplay = unique(userSetIds.concat(props.customEmojiFeaturedIds || []));
    const setsToDisplay = Object.values(pickTruthy(props.stickerSetsById, setIdsToDisplay));

    return [...defaultSets, ...setsToDisplay];
  });

  const sections = createMemo((): EmojiSection[] => {
    const categories2 = categories();
    if (!categories2) {
      return MEMO_EMPTY_ARRAY;
    }

    const list: EmojiSection[] = [];

    if (props.recentEmojis?.length) {
      list.push({
        type: 'category',
        category: { id: RECENT_SYMBOL_SET_ID, name: oldLang('RecentStickers'), emojis: props.recentEmojis },
        title: oldLang('RecentStickers'),
      });
    }

    categories2.forEach((category, index) => {
      list.push({ type: 'category', category, title: oldLang(`Emoji${index + 1}`) });
    });

    customSets().forEach((set) => {
      list.push({ type: 'set', set, isChatEmojiSet: set.id === props.chatEmojiSetId });
    });

    return list;
  });

  const firstCategoryIndex = createMemo(() => (props.recentEmojis?.length ? 1 : 0));
  const lastCategoryIndex = createMemo(() => firstCategoryIndex() + (categories()?.length || 0) - 1);
  const isPillActive = createMemo(
    () => Boolean(categories()) && activeSetIndex() >= firstCategoryIndex() && activeSetIndex() <= lastCategoryIndex(),
  );

  const pillCategories = createMemo((): PillCategory[] => {
    const categories2 = categories();
    if (!categories2) {
      return MEMO_EMPTY_ARRAY;
    }

    return categories2.map(({ id, name }) => ({ id, name, icon: ICONS_BY_CATEGORY[id] || 'smile' }));
  });

  createMeasureEffect(
    depsOf(() => [activeSetIndex(), isPillActive(), shouldRenderContent()] as const),
    ([activeSetIndex2, isPillActive2, shouldRenderContent2]) => {
      if (!shouldRenderContent2) {
        return;
      }

      const activeSection = sections()[activeSetIndex2];
      if (activeSection?.type === 'set' && activeSection.set.id === RECENT_SYMBOL_SET_ID) {
        return;
      }

      requestMeasure(() => {
        const header = headerEl;
        if (!header) {
          return;
        }

        const target = isPillActive2
          ? header.querySelector<HTMLElement>('.EmojiPicker-header-pill')
          : header.querySelector<HTMLElement>('.symbol-set-button.activated');
        if (!target) {
          return;
        }

        const headerRect = header.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const targetWidth = isPillActive2 ? PILL_EXPANDED_WIDTH : targetRect.width;
        const targetLeftInContent = targetRect.left - headerRect.left + header.scrollLeft;
        const newLeft = targetLeftInContent - (headerRect.width - targetWidth) / 2;
        animateHorizontalScroll(header, newLeft);
      });
    },
  );

  // Initialize data on first render.
  onMount(() => {
    const timeout = setTimeout(() => {
      void ensureEmojiData().then((data) => {
        setCategories(data.categories);
        setEmojis(data.emojis);
      });
    }, OPEN_ANIMATION_DELAY);

    return () => {
      clearTimeout(timeout);
    };
  });

  const handleEmojiSelect = (emoji: string, name: string) => {
    props.onEmojiSelect(emoji, name);
  };

  const handleCustomEmojiSelect = (sticker: ApiSticker) => {
    props.onCustomEmojiSelect(sticker);
  };

  const handlePillCategorySelect = (index: number) => {
    selectSection(firstCategoryIndex() + index);
  };

  const handleRecentSelect = () => {
    selectSection(0);
  };

  const handlePackSelect = (set: ApiStickerSet) => {
    setOpenedPack(set);

    if (!props.stickerSetsById[set.id] || !set.stickers || set.stickers.length < set.count) {
      loadStickers({ stickerSetInfo: { id: set.id, accessHash: set.accessHash } });
    }
  };

  const handlePackBackClick = () => {
    setOpenedPack(undefined);
  };

  const handleLocalSectionToggle = () => {
    setIsLocalSectionCollapsed(!isLocalSectionCollapsed());
  };

  const handleGlobalSectionToggle = () => {
    setIsGlobalSectionCollapsed(!isGlobalSectionCollapsed());
  };

  const handleQueryChange = (value: string) => {
    setOpenedPack(undefined);
    setQuery(value);
  };

  const handleGroupSelect = (group?: ApiEmojiGroup) => {
    setOpenedPack(undefined);
    selectGroup(group);
  };

  const handleScroll = (e: Event) => {
    handleContentScroll(e);

    if (!textResults() || openedSet() || isGlobalSectionCollapsed()) {
      return;
    }

    const container = e.currentTarget as HTMLDivElement;
    if (container.scrollHeight - container.scrollTop - container.clientHeight < LOAD_MORE_THRESHOLD) {
      searchMore();
    }
  };

  function renderCover(section: Accessor<EmojiSection>, index: Accessor<number>) {
    const coverSection = createMemo(() => {
      const section2 = section();
      return section2.type === 'set' && section2.set.id !== RECENT_SYMBOL_SET_ID ? section2 : undefined;
    });

    return (
      <Show when={coverSection()}>
        {(coverSection2) => {
          const set = () => coverSection2().set;
          const firstSticker = () => set().stickers?.[0];
          const buttonClassName = () =>
            buildClassName(
              'symbol-set-button',
              'EmojiPicker-header-cover',
              index() === activeSetIndex() && 'activated',
            );

          const isLockedSet = () =>
            !props.isCurrentUserPremium &&
            !props.isSavedMessages &&
            !coverSection2().isChatEmojiSet &&
            selectIsSetPremium(set());

          return (
            <Button
              className={buttonClassName()}
              ariaLabel={set().title}
              round
              color="translucent"
              onClick={() => selectSection(index())}
            >
              {set().hasThumbnail || !firstSticker() ? (
                <StickerSetCover
                  stickerSet={set() as ApiStickerSet}
                  size={COVER_SIZE}
                  noPlay={!props.canAnimate || !canLoadAndPlay()}
                  forcePlayback
                  observeIntersection={observeIntersectionForCovers}
                />
              ) : (
                <StickerButton
                  sticker={firstSticker()!}
                  size={COVER_SIZE}
                  title={set().title}
                  className="EmojiPicker-cover-icon"
                  noPlay={!props.canAnimate || !canLoadAndPlay()}
                  observeIntersection={observeIntersectionForCovers}
                  noContextMenu
                  isCurrentUserPremium
                  withTranslucentThumb={props.isTranslucent}
                  clickArg={index()}
                  forcePlayback
                />
              )}
              {isLockedSet() && <Icon name="lock" className="EmojiPicker-cover-lock" />}
            </Button>
          );
        }}
      </Show>
    );
  }

  function renderBrowseContent() {
    return (
      <div>
        <For
          each={sections()}
          keyed={(section) => (section.type === 'category' ? `category-${section.category.id}` : section.set.id)}
        >
          {(section, index) => {
            const isNearActive = () => activeSetIndex() >= index() - 1 && activeSetIndex() <= index() + 1;

            // The key of the row contains the type, so a row never changes its type.
            if (untrack(section).type === 'category') {
              const categorySection = () => section() as Extract<EmojiSection, { type: 'category' }>;

              return (
                <EmojiCategory
                  category={categorySection().category}
                  sectionId={`${prefix()}-${index()}`}
                  title={categorySection().title}
                  allEmojis={emojis()!}
                  observeIntersection={observeIntersectionForSet}
                  shouldRender={isNearActive()}
                  onEmojiSelect={handleEmojiSelect}
                />
              );
            }

            const setSection = () => section() as Extract<EmojiSection, { type: 'set' }>;

            return (
              <StickerSet
                stickerSet={setSection().set}
                loadAndPlay={Boolean(props.canAnimate && canLoadAndPlay())}
                index={index()}
                idPrefix={prefix()}
                observeIntersection={observeIntersectionForSet}
                observeIntersectionForPlayingItems={observeIntersectionForPlayingItems}
                observeIntersectionForShowingItems={observeIntersectionForShowingItems}
                isNearActive={isNearActive()}
                isSavedMessages={props.isSavedMessages}
                isChatEmojiSet={setSection().isChatEmojiSet}
                isCurrentUserPremium={props.isCurrentUserPremium}
                isTranslucent={props.isTranslucent}
                onStickerSelect={handleCustomEmojiSelect}
                forcePlayback
              />
            );
          }}
        </For>
      </div>
    );
  }

  function renderOpenedPack(isFrozen: Accessor<boolean>) {
    const stickerSet = frozenWhile(openedSet, isFrozen);

    return (
      <InlineStickerSetView
        stickerSet={stickerSet()!}
        stickerSize={EMOJI_SIZE_PICKER}
        observeIntersection={observeIntersectionForResults}
        noPlay={!props.canAnimate || !canLoadAndPlay()}
        isSavedMessages={props.isSavedMessages}
        isCurrentUserPremium={props.isCurrentUserPremium}
        isTranslucent={props.isTranslucent}
        onStickerSelect={handleCustomEmojiSelect}
      />
    );
  }

  function renderSearchResults(isFrozen: Accessor<boolean>) {
    if (untrack(displayGroup)) {
      const frozenNativeResults = frozenWhile(nativeResults, isFrozen);
      const frozenCustomResults = frozenWhile(customResults, isFrozen);
      const frozenCustomResultIds = frozenWhile(customResultIds, isFrozen);

      return (
        <div>
          <EmojiSearchResults
            nativeResults={frozenNativeResults()}
            customResults={frozenCustomResults()}
            customResultIds={frozenCustomResultIds()}
            isCurrentUserPremium={props.isCurrentUserPremium}
            isSavedMessages={props.isSavedMessages}
            observeIntersection={observeIntersectionForResults}
            onEmojiSelect={handleEmojiSelect}
            onCustomEmojiSelect={handleCustomEmojiSelect}
          />
        </div>
      );
    }

    const frozenTextResults = frozenWhile(textResults, isFrozen);

    return (
      <div>
        <EmojiSearchResults
          nativeResults={frozenTextResults()?.natives}
          customResults={frozenTextResults()?.localCustom}
          packSets={frozenTextResults()?.packSets}
          globalResults={frozenTextResults()?.globalStickers}
          withSections
          isCurrentUserPremium={props.isCurrentUserPremium}
          isSavedMessages={props.isSavedMessages}
          isLocalSectionCollapsed={isLocalSectionCollapsed()}
          isGlobalSectionCollapsed={isGlobalSectionCollapsed()}
          observeIntersection={observeIntersectionForResults}
          onEmojiSelect={handleEmojiSelect}
          onCustomEmojiSelect={handleCustomEmojiSelect}
          onPackSelect={handlePackSelect}
          onLocalSectionToggle={handleLocalSectionToggle}
          onGlobalSectionToggle={handleGlobalSectionToggle}
        />
      </div>
    );
  }

  // Deviation: each `<Transition>` slide renders the content that was current when its key became active and freezes
  // the data it shows while it is not the active slide (teact's Transition kept the last children of an inactive key).
  function renderContent(slide: TransitionSlide) {
    const isFrozen = () => !slide.isActive();

    return untrack(() => {
      if (openedSet()) return renderOpenedPack(isFrozen);
      if (isShowingResults()) return renderSearchResults(isFrozen);
      return renderBrowseContent();
    });
  }

  const containerClassName = createMemo(() => buildClassName('EmojiPicker', props.className));
  const headerClassName = createMemo(() =>
    buildClassName('EmojiPicker-header', 'no-scrollbar', !shouldHideTopBorder() && 'with-top-border'),
  );

  function renderInner() {
    onMount(() => {
      setHeaderRef(headerEl);
    });

    return (
      <div class={buildClassName('EmojiPicker-inner', isSearchActive() && 'is-search-active')}>
        <div ref={headerEl} class={headerClassName()} dir={oldLang.isRtl ? 'rtl' : undefined}>
          <div class="EmojiPicker-header-items">
            {Boolean(props.recentEmojis?.length) && (
              <Button
                className={buildClassName(
                  'symbol-set-button',
                  'EmojiPicker-header-recent',
                  activeSetIndex() === 0 && 'activated',
                )}
                round
                faded
                color="translucent"
                onClick={handleRecentSelect}
                ariaLabel={oldLang('RecentStickers')}
                iconName="clock"
              />
            )}
            <EmojiCategoryPill
              categories={pillCategories()}
              className="EmojiPicker-header-pill"
              activeCategoryIndex={isPillActive() ? activeSetIndex() - firstCategoryIndex() : undefined}
              isActive={isPillActive()}
              onCategorySelect={handlePillCategorySelect}
            />
            <For
              each={sections()}
              keyed={(section) => (section.type === 'category' ? `category-${section.category.id}` : section.set.id)}
            >
              {renderCover}
            </For>
          </div>
        </div>
        <div
          ref={containerEl}
          onScroll={handleScroll}
          class={buildClassName('EmojiPicker-main', IS_TOUCH_ENV ? 'no-scrollbar' : 'custom-scroll')}
        >
          <EmojiSearch
            value={query()}
            groups={props.emojiGroups}
            activeGroup={activeGroup()}
            isLoading={isSearchLoading()}
            hasBackButton={Boolean(openedSet())}
            onChange={handleQueryChange}
            onGroupSelect={handleGroupSelect}
            onBackClick={handlePackBackClick}
            onFocus={markSearchFocused}
            onBlur={unmarkSearchFocused}
          />
          <Transition name="zoomFade" activeKey={contentActiveKey()} className="EmojiPicker-content-transition">
            {renderContent}
          </Transition>
        </div>
        <Show when={openedSet()}>{(openedSet2) => <StickerSetToggleButton stickerSet={openedSet2()} />}</Show>
      </div>
    );
  }

  return (
    <Transition className={containerClassName()} activeKey={shouldRenderContent() ? 1 : 0} name="fade" shouldCleanup>
      {(outerSlide) => (outerSlide.key === 0 ? <Loading /> : renderInner())}
    </Transition>
  );
};

const mapStateToProps = (global: GlobalState, { chatId }: OwnProps): Complete<StateProps> => {
  const { language } = selectSharedSettings(global);
  const baseEmojiKeywords = global.emojiKeywords[BASE_EMOJI_KEYWORD_LANG];
  const emojiKeywords = language !== BASE_EMOJI_KEYWORD_LANG ? global.emojiKeywords[language] : undefined;
  const chatFullInfo = chatId ? selectChatFullInfo(global, chatId) : undefined;
  const isSavedMessages = Boolean(chatId && selectIsChatWithSelf(global, chatId));

  return {
    recentEmojis: global.recentEmojis,
    baseEmojiKeywords: baseEmojiKeywords?.keywords,
    emojiKeywords: emojiKeywords?.keywords,
    customEmojisById: global.customEmojis.byId,
    recentCustomEmojiIds: global.recentCustomEmojis,
    stickerSetsById: global.stickers.setsById,
    addedCustomEmojiIds: global.customEmojis.added.setIds,
    customEmojiFeaturedIds: global.customEmojis.featuredIds,
    chatEmojiSetId: chatFullInfo?.emojiSet?.id,
    canAnimate: selectCanPlayAnimatedEmojis(global),
    isSavedMessages,
    isCurrentUserPremium: selectIsCurrentUserPremium(global),
    emojiGroups: global.emojiGroups.groups,
  };
};

export default EmojiPicker;
