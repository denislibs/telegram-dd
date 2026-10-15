import {
  createEffect,
  createMeasureEffect,
  createMemo,
  createMutationEffect,
  createSignal,
  onMount,
  requestMeasure,
} from 'frameact';
import { For } from 'frameact/dom';
import { getActions, getGlobal, withGlobal } from '../../../global';
import { depsOf } from '../../../util/effectDeps';
import type { GlobalState } from '../../../global/types';

import type { ApiEmojiGroup, ApiSticker, ApiStickerSet } from '../../../api/types';
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
import usePrevDuringAnimation from '../../../hooks/usePrevDuringAnimation';
import useScrolledState from '../../../hooks/useScrolledState';
import { useStickerPickerObservers } from '../../common/hooks/useStickerPickerObservers';
import useAsyncRendering from '../../right/hooks/useAsyncRendering';
import useEmojiSearch from './hooks/useEmojiSearch';

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

const EmojiPicker = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { loadStickers } = getActions();

  let containerRef!: HTMLDivElement;
  let headerRef!: HTMLDivElement;

  const [categories, setCategories] = createSignal<EmojiCategoryData[] | undefined>(undefined);
  const [emojis, setEmojis] = createSignal<EmojiData['emojis'] | undefined>(undefined);
  const { isMobile } = useAppLayout();
  const { handleScroll: handleContentScroll, isAtBeginning: shouldHideTopBorder } = useScrolledState();

  const emojiSearchResult = createMemo(() =>
    useEmojiSearch({
      allEmojis: () => emojis(),
      baseEmojiKeywords: () => props.baseEmojiKeywords,
      emojiKeywords: () => props.emojiKeywords,
      noQueryCustomResults: true,
    }),
  );
  const query = () => emojiSearchResult().query;
  const hasQuery = () => emojiSearchResult().hasQuery;
  const activeGroup = () => emojiSearchResult().activeGroup;
  const displayGroup = () => emojiSearchResult().displayGroup;
  const isSearchActive = () => emojiSearchResult().isSearchActive;
  const nativeResults = () => emojiSearchResult().nativeResults;
  const customResults = () => emojiSearchResult().customResults;
  const customResultIds = () => emojiSearchResult().customResultIds;
  const queryResults = () => emojiSearchResult().queryResults;
  const setQuery = () => emojiSearchResult().setQuery;
  const selectGroup = () => emojiSearchResult().selectGroup;
  const searchMore = () => emojiSearchResult().searchMore;
  const markSearchFocused = () => emojiSearchResult().markSearchFocused;
  const unmarkSearchFocused = () => emojiSearchResult().unmarkSearchFocused;

  const trimmedQuery = createMemo(() => query().trim().toLowerCase());

  let textResultsRef:
    | {
        key: string;
        natives?: Emoji[];
        localCustom?: ApiSticker[];
        packSets?: ApiStickerSet[];
        globalStickers?: ApiSticker[];
      }
    | undefined;
  const currentQueryResults = createMemo(() => (queryResults()?.key === trimmedQuery() ? queryResults() : undefined));
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (hasQuery() && (nativeResults() !== undefined || currentQueryResults())) {
    textResultsRef = {
      key: trimmedQuery(),
      natives: nativeResults(),
      localCustom: nativeResults()
        ? uniqueByField(
            selectCustomEmojiForEmojis(
              getGlobal(),
              nativeResults().map(({ native }) => native),
            ),
            'id',
          )
        : undefined,
      // Full sets loaded on demand (e.g. for covers) land in `stickerSetsById`, so prefer them over search snapshots
      packSets: currentQueryResults()?.packSets?.map((set) => props.stickerSetsById[set.id] || set),
      globalStickers: currentQueryResults()?.globalStickers,
    };
  }
  const textResults = createMemo(() => (hasQuery() ? textResultsRef : undefined));
  const isShowingResults = createMemo(() => (displayGroup() ? true : Boolean(textResults())));
  const isSearchLoading = createMemo(() => hasQuery() && !currentQueryResults());

  const [openedPack, setOpenedPack] = createSignal<ApiStickerSet | undefined>(undefined);
  const [isLocalSectionCollapsed, setIsLocalSectionCollapsed] = createSignal(false);
  const [isGlobalSectionCollapsed, setIsGlobalSectionCollapsed] = createSignal(false);

  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    () => trimmedQuery(),
    (trimmedQuery2) => {
      setIsLocalSectionCollapsed(false);
      setIsGlobalSectionCollapsed(false);
    },
  );
  const openedSet = createMemo(() => openedPack() && (props.stickerSetsById[openedPack().id] || openedPack()));

  const contentActiveKey = useTransitionActiveKey(() => [
    isShowingResults(),
    displayGroup()?.title,
    textResults()?.key,
    openedSet()?.id,
  ]);

  const prefix = createMemo(() => `${props.idPrefix === undefined ? DEFAULT_ID_PREFIX : props.idPrefix}-emoji-section`);
  const stickerPickerObserversResult = createMemo(() =>
    useStickerPickerObservers(
      () => containerRef,
      () => headerRef,
      () => prefix(),
      () => props.isHidden,
    ),
  );
  const activeSetIndex = () => stickerPickerObserversResult().activeSetIndex;
  const observeIntersectionForSet = () => stickerPickerObserversResult().observeIntersectionForSet;
  const observeIntersectionForPlayingItems = () => stickerPickerObserversResult().observeIntersectionForPlayingItems;
  const observeIntersectionForShowingItems = () => stickerPickerObserversResult().observeIntersectionForShowingItems;
  const observeIntersectionForCovers = () => stickerPickerObserversResult().observeIntersectionForCovers;
  const selectSection = () => stickerPickerObserversResult().selectStickerSet;

  const { observe: observeIntersectionForResults } = useIntersectionObserver({
    rootRef: () => containerRef,
    throttleMs: INTERSECTION_THROTTLE,
  });

  createMutationEffect(
    depsOf(() => [isShowingResults(), displayGroup(), textResults()?.key, openedSet()?.id] as const),
    ([isShowingResults2, displayGroup2]) => {
      if (containerRef) {
        resetScroll(containerRef, 0);
      }
    },
  );

  // TODO(codemod): usePrevDuringAnimation: frozenWhile(source, isAnimating) or currentOrPrev
  const canLoadAndPlay = usePrevDuringAnimation(props.loadAndPlay || undefined, SLIDE_TRANSITION_DURATION);

  const canRenderContents = useAsyncRendering([], MENU_TRANSITION_DURATION);
  const shouldRenderContent = createMemo(() => emojis() && canRenderContents);

  useHorizontalScroll(() => headerRef, isMobile || !shouldRenderContent());

  const oldLang = useOldLang();

  // TODO(codemod): dependency on a container (customEmojisById, stickerSetsById) keeps its identity while its content changes: the memo must read the fields it needs (store contract §12.7)
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
    if (!categories()) {
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

    categories().forEach((category, index) => {
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
    if (!categories()) {
      return MEMO_EMPTY_ARRAY;
    }

    return categories().map(({ id, name }) => ({ id, name, icon: ICONS_BY_CATEGORY[id] || 'smile' }));
  });

  createMeasureEffect(
    depsOf(() => [activeSetIndex(), isPillActive(), shouldRenderContent()] as const),
    ([activeSetIndex2, isPillActive2]) => {
      if (!shouldRenderContent()) {
        return;
      }

      const activeSection = sections()[activeSetIndex2];
      if (activeSection?.type === 'set' && activeSection.set.id === RECENT_SYMBOL_SET_ID) {
        return;
      }

      requestMeasure(() => {
        const header = headerRef;
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
      // eslint-disable-next-line react-hooks-static-deps/exhaustive-deps
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
    selectSection()(firstCategoryIndex() + index);
  };

  const handleRecentSelect = () => {
    selectSection()(0);
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
    setQuery()(value);
  };

  const handleGroupSelect = (group?: ApiEmojiGroup) => {
    setOpenedPack(undefined);
    selectGroup()(group);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    handleContentScroll(e);

    if (!textResults() || openedSet() || isGlobalSectionCollapsed()) {
      return;
    }

    const container = e.currentTarget;
    if (container.scrollHeight - container.scrollTop - container.clientHeight < LOAD_MORE_THRESHOLD) {
      searchMore()();
    }
  };

  function renderCover(section: EmojiSection, index: number) {
    if (section.type !== 'set' || section.set.id === RECENT_SYMBOL_SET_ID) {
      return undefined;
    }

    const { set } = section;
    const firstSticker = set.stickers?.[0];
    const buttonClassName = buildClassName(
      'symbol-set-button',
      'EmojiPicker-header-cover',
      index === activeSetIndex() && 'activated',
    );

    const isLockedSet =
      !props.isCurrentUserPremium && !props.isSavedMessages && !section.isChatEmojiSet && selectIsSetPremium(set);
    const lockBadge = isLockedSet && <Icon name="lock" className="EmojiPicker-cover-lock" />;

    return (
      <Button
        className={buttonClassName}
        ariaLabel={set.title}
        round
        color="translucent"

        onClick={() => selectSection()(index)}
      >
        {set.hasThumbnail || !firstSticker ? (
          <StickerSetCover
            stickerSet={set as ApiStickerSet}
            size={COVER_SIZE}
            noPlay={!props.canAnimate || !canLoadAndPlay}
            forcePlayback
            observeIntersection={observeIntersectionForCovers()}
          />
        ) : (
          <StickerButton
            sticker={firstSticker}
            size={COVER_SIZE}
            title={set.title}
            className="EmojiPicker-cover-icon"
            noPlay={!props.canAnimate || !canLoadAndPlay}
            observeIntersection={observeIntersectionForCovers()}
            noContextMenu
            isCurrentUserPremium
            withTranslucentThumb={props.isTranslucent}
            clickArg={index}
            forcePlayback
          />
        )}
        {lockBadge}
      </Button>
    );
  }

  function renderBrowseContent() {
    return (
      <div>
        <For each={sections()} keyed={(section) => section.set.id}>
          {(section, index) => {
            if (section().type === 'category') {
              return (
                <EmojiCategory
                  category={section().category}
                  sectionId={`${prefix()}-${index()}`}
                  title={section().title}
                  allEmojis={emojis()!}
                  observeIntersection={observeIntersectionForSet()}
                  shouldRender={activeSetIndex() >= index() - 1 && activeSetIndex() <= index() + 1}
                  onEmojiSelect={handleEmojiSelect}
                />
              );
            }

            return (
              <StickerSet
                stickerSet={section().set}
                loadAndPlay={Boolean(props.canAnimate && canLoadAndPlay)}
                index={index()}
                idPrefix={prefix()}
                observeIntersection={observeIntersectionForSet()}
                observeIntersectionForPlayingItems={observeIntersectionForPlayingItems()}
                observeIntersectionForShowingItems={observeIntersectionForShowingItems()}
                isNearActive={activeSetIndex() >= index() - 1 && activeSetIndex() <= index() + 1}
                isSavedMessages={props.isSavedMessages}
                isChatEmojiSet={section().isChatEmojiSet}
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

  function renderOpenedPack() {
    return (
      <InlineStickerSetView
        stickerSet={openedSet()!}
        stickerSize={EMOJI_SIZE_PICKER}
        observeIntersection={observeIntersectionForResults}
        noPlay={!props.canAnimate || !canLoadAndPlay}
        isSavedMessages={props.isSavedMessages}
        isCurrentUserPremium={props.isCurrentUserPremium}
        isTranslucent={props.isTranslucent}
        onStickerSelect={handleCustomEmojiSelect}
      />
    );
  }

  function renderSearchResults() {
    if (displayGroup()) {
      return (
        <div>
          <EmojiSearchResults
            nativeResults={nativeResults()}
            customResults={customResults()}
            customResultIds={customResultIds()}
            isCurrentUserPremium={props.isCurrentUserPremium}
            isSavedMessages={props.isSavedMessages}
            observeIntersection={observeIntersectionForResults}
            onEmojiSelect={handleEmojiSelect}
            onCustomEmojiSelect={handleCustomEmojiSelect}
          />
        </div>
      );
    }

    return (
      <div>
        <EmojiSearchResults
          nativeResults={textResults()!.natives}
          customResults={textResults()!.localCustom}
          packSets={textResults()!.packSets}
          globalResults={textResults()!.globalStickers}
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

  const containerClassName = createMemo(() => buildClassName('EmojiPicker', props.className));
  const headerClassName = buildClassName(
    'EmojiPicker-header',
    'no-scrollbar',
    !shouldHideTopBorder && 'with-top-border',
  );

  return (
    // TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6)
    <Transition className={containerClassName()} activeKey={shouldRenderContent() ? 1 : 0} name="fade" shouldCleanup>
      {!shouldRenderContent() ? (
        <Loading />
      ) : (
        <div class={buildClassName('EmojiPicker-inner', isSearchActive() && 'is-search-active')}>
          <div ref={headerRef} class={headerClassName} dir={oldLang.isRtl ? 'rtl' : undefined}>
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
              {sections().map(renderCover)}
            </div>
          </div>
          <div
            ref={containerRef}
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
              onFocus={markSearchFocused()}
              onBlur={unmarkSearchFocused()}
            />
            {/* TODO(codemod): <Transition> children: use the render function and render by slide.key (framework guide §6) */}
            <Transition name="zoomFade" activeKey={contentActiveKey} className="EmojiPicker-content-transition">
              {openedSet() ? renderOpenedPack() : isShowingResults() ? renderSearchResults() : renderBrowseContent()}
            </Transition>
          </div>
          {openedSet() && <StickerSetToggleButton stickerSet={openedSet()} />}
        </div>
      )}
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
