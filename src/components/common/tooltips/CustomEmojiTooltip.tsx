import { createMemo, frozenWhile } from 'frameact';
import { For, Show, splitProps } from 'frameact/dom';
import { getActions } from '../../../global';

import type { ApiSticker } from '../../../api/types';
import type { GlobalActions } from '../../../global';

import { COMPOSER_EMOJI_SIZE_PICKER } from '../../../config';
import buildClassName from '../../../util/buildClassName';

import useHorizontalScroll from '../../../hooks/useHorizontalScroll';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';

import StickerButton from '../StickerButton';
import RichEditorTooltipPanel from './RichEditorTooltipPanel';

import styles from './CustomEmojiTooltip.module.scss';
import sharedStyles from './RichEditorTooltip.module.scss';

export type OwnProps = {
  isOpen: boolean;
  customEmoji?: ApiSticker[];
  isSavedMessages?: boolean;
  isCurrentUserPremium?: boolean;
  noPlay?: boolean;
  addRecentCustomEmoji: GlobalActions['addRecentCustomEmoji'];
  onCustomEmojiSelect: (customEmoji: ApiSticker) => void;
};

const INTERSECTION_THROTTLE = 200;

const CustomEmojiTooltip = (p: OwnProps) => {
  const [, props] = splitProps(p, ['isOpen']);
  const frozen = frozenWhile(
    () => props,
    () => !p.isOpen,
  );
  const addRecentCustomEmoji = () => frozen().addRecentCustomEmoji;
  const onCustomEmojiSelect = () => frozen().onCustomEmojiSelect;
  const customEmoji = () => frozen().customEmoji;
  const isSavedMessages = () => frozen().isSavedMessages;
  const isCurrentUserPremium = () => frozen().isCurrentUserPremium;
  const noPlay = () => frozen().noPlay;

  const { clearCustomEmojiForEmoji } = getActions();

  let containerRef!: HTMLDivElement;
  const hasCustomEmoji = createMemo(() => Boolean(customEmoji()?.length));

  useHorizontalScroll(
    () => containerRef,
    () => !p.isOpen || !hasCustomEmoji(),
  );

  const { observe: observeIntersection } = useIntersectionObserver({
    rootRef: () => containerRef,
    throttleMs: INTERSECTION_THROTTLE,
  });

  const handleCustomEmojiSelect = (ce: ApiSticker) => {
    onCustomEmojiSelect()(ce);
    addRecentCustomEmoji()({
      documentId: ce.id,
    });
    clearCustomEmojiForEmoji();
  };

  const className = buildClassName(sharedStyles.root, styles.root, 'composer-tooltip no-scrollbar');

  return (
    <Show when={hasCustomEmoji()}>
      <RichEditorTooltipPanel isOpen={p.isOpen}>
        <div ref={containerRef} class={className}>
          <For each={customEmoji()} keyed={(sticker) => sticker.id}>
            {(sticker) => (
              <StickerButton
                sticker={sticker()}
                className={styles.emojiButton}
                size={COMPOSER_EMOJI_SIZE_PICKER}
                observeIntersection={observeIntersection}
                onClick={handleCustomEmojiSelect}
                clickArg={sticker()}
                isSavedMessages={isSavedMessages()}
                canViewSet
                isCurrentUserPremium={isCurrentUserPremium()}
                noPlay={noPlay()}
              />
            )}
          </For>
        </div>
      </RichEditorTooltipPanel>
    </Show>
  );
};

export default CustomEmojiTooltip;
