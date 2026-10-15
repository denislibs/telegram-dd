import { createMemo } from 'frameact';
import { For, Show } from 'frameact/dom';
import { getActions, getGlobal } from '../../global';

import type { ApiSticker, ApiStickerSet } from '../../api/types';

import { EMOJI_SIZE_PICKER } from '../../config';
import buildClassName from '../../util/buildClassName';
import { REM } from './helpers/mediaDimensions';

import useLang from '../../hooks/useLang';
import useOldLang from '../../hooks/useOldLang';

import EmojiButton from '../middle/composer/EmojiButton';
import StickerSetCover from '../middle/composer/StickerSetCover';
import Button from '../ui/Button';
import CollapsibleSection from './CollapsibleSection';
import CustomEmoji from './CustomEmoji';
import FoundPacksRow from './FoundPacksRow';
import StickerButton from './StickerButton';

import pickerStyles from '../middle/composer/StickerPicker.module.scss';
import styles from './EmojiSearchResults.module.scss';

type OwnProps = {
  nativeResults?: Emoji[];
  customResults?: ApiSticker[];
  customResultIds?: string[];
  packSets?: ApiStickerSet[];
  globalResults?: ApiSticker[];
  withSections?: boolean;
  isCurrentUserPremium?: boolean;
  isSavedMessages?: boolean;
  isLocalSectionCollapsed?: boolean;
  isGlobalSectionCollapsed?: boolean;
  observeIntersection: ObserveFn;
  onEmojiSelect?: (emoji: string, name: string) => void;
  onCustomEmojiSelect: (sticker: ApiSticker) => void;
  onPackSelect?: (set: ApiStickerSet) => void;
  onLocalSectionToggle?: NoneToVoidFunction;
  onGlobalSectionToggle?: NoneToVoidFunction;
};

const FOUND_PACK_COVER_SIZE = 3 * REM;

const EmojiSearchResults = (props: OwnProps) => {
  const oldLang = useOldLang();
  const lang = useLang();

  const handleGroupCustomEmojiClick = (documentId: string) => {
    const sticker = getGlobal().customEmojis.byId[documentId];
    if (!sticker) {
      return;
    }

    const isLocked = !props.isCurrentUserPremium && !props.isSavedMessages && !sticker.isFree;
    if (isLocked) {
      getActions().showNotification({
        message: { key: 'PremiumUnlockEmoji' },
        actionText: { key: 'PremiumMore' },
        action: {
          action: 'openPremiumModal',
          payload: { initialSection: 'animated_emoji' },
        },
      });
      return;
    }

    props.onCustomEmojiSelect(sticker);
  };

  const handleGroupCustomEmojiKeyDown = (e: React.KeyboardEvent, documentId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleGroupCustomEmojiClick(documentId);
    }
  };

  const localIds = createMemo(() => new Set((props.customResults || []).map(({ id }) => id)));

  const serverResultIds = createMemo(() => {
    if (!props.customResultIds?.length) {
      return undefined;
    }

    return props.customResultIds.filter((id) => !localIds().has(id));
  });

  const dedupedGlobalResults = createMemo(() => {
    if (!props.globalResults?.length) {
      return undefined;
    }

    return props.globalResults.filter(({ id }) => !localIds().has(id));
  });

  const hasLocalResults = createMemo(() =>
    Boolean(props.nativeResults?.length || props.customResults?.length || serverResultIds()?.length),
  );
  const hasResults = createMemo(
    () => hasLocalResults() || Boolean(props.packSets?.length || dedupedGlobalResults()?.length),
  );

  function renderCustomStickers(stickers: ApiSticker[]) {
    return stickers.map((sticker) => (
      <StickerButton
        sticker={sticker}
        size={EMOJI_SIZE_PICKER}
        observeIntersection={props.observeIntersection}
        onClick={props.onCustomEmojiSelect}
        clickArg={sticker}
        isSavedMessages={props.isSavedMessages}
        isCurrentUserPremium={props.isCurrentUserPremium}
      />
    ));
  }

  function renderLocalGrid() {
    return (
      <div class={buildClassName('symbol-set-container', 'shown', styles.grid)} dir={oldLang.isRtl ? 'rtl' : undefined}>
        {props.customResults && renderCustomStickers(props.customResults)}
        {props.onEmojiSelect &&
          props.nativeResults?.map((emoji) => <EmojiButton emoji={emoji} onClick={props.onEmojiSelect} />)}
        <For each={serverResultIds()} keyed={(documentId) => documentId}>
          {(documentId) => (
            <div
              role="button"
              tabIndex={0}
              class={styles.customCell}
              onClick={() => handleGroupCustomEmojiClick(documentId())}
              onKeyDown={(e) => handleGroupCustomEmojiKeyDown(e, documentId())}
            >
              <CustomEmoji
                documentId={documentId()}
                size={EMOJI_SIZE_PICKER}
                isBig
                noPlaceholder
                forceOnHeavyAnimation
                observeIntersectionForLoading={props.observeIntersection}
                observeIntersectionForPlaying={props.observeIntersection}
              />
            </div>
          )}
        </For>
      </div>
    );
  }

  function renderFoundPack(set: ApiStickerSet) {
    const firstSticker = set.covers?.[0] || set.stickers?.[0];

    return (
      <Button
        className={pickerStyles.foundPack}
        color="translucent"
        ariaLabel={set.title}

        onClick={() => props.onPackSelect?.(set)}
      >
        {set.hasThumbnail || !firstSticker ? (
          <StickerSetCover
            stickerSet={set}
            size={FOUND_PACK_COVER_SIZE}
            observeIntersection={props.observeIntersection}
            forcePlayback
          />
        ) : (
          <StickerButton
            sticker={firstSticker}
            size={FOUND_PACK_COVER_SIZE}
            className={pickerStyles.foundPackCover}
            observeIntersection={props.observeIntersection}
            noContextMenu
            isCurrentUserPremium
            clickArg={0}
            forcePlayback
          />
        )}
        <span class={pickerStyles.foundPackTitle}>{set.title}</span>
      </Button>
    );
  }

  return (
    <Show when={hasResults()} fallback={<div class={styles.noResults}>{lang('NoEmojiFound')}</div>}>
      <Show when={props.withSections} fallback={renderLocalGrid()}>
        <div>
          {Boolean(props.packSets?.length) && <FoundPacksRow>{props.packSets.map(renderFoundPack)}</FoundPacksRow>}
          {hasLocalResults() && (
            <CollapsibleSection
              className={pickerStyles.resultSection}
              title={lang('StickerSearchResult')}
              isCollapsed={Boolean(props.isLocalSectionCollapsed)}
              onToggle={props.onLocalSectionToggle!}
            >
              {renderLocalGrid()}
            </CollapsibleSection>
          )}
          {Boolean(dedupedGlobalResults()?.length) && (
            <CollapsibleSection
              className={pickerStyles.resultSection}
              title={lang('StickerSearchGlobalResult')}
              isCollapsed={Boolean(props.isGlobalSectionCollapsed)}
              onToggle={props.onGlobalSectionToggle!}
            >
              <div
                class={buildClassName('symbol-set-container', 'shown', styles.grid)}
                dir={oldLang.isRtl ? 'rtl' : undefined}
              >
                {renderCustomStickers(dedupedGlobalResults())}
              </div>
            </CollapsibleSection>
          )}
        </div>
      </Show>
    </Show>
  );
};

export default EmojiSearchResults;
