import { createMemo, createSignal, frozenWhile } from 'frameact';
import { For, Show } from 'frameact/dom';
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

const CustomEmojiTooltip = (props: OwnProps) => {
  const isClosing = () => !props.isOpen;
  const addRecentCustomEmoji = frozenWhile(() => props.addRecentCustomEmoji, isClosing);
  const onCustomEmojiSelect = frozenWhile(() => props.onCustomEmojiSelect, isClosing);
  const customEmoji = frozenWhile(() => props.customEmoji, isClosing);
  const isSavedMessages = frozenWhile(() => props.isSavedMessages, isClosing);
  const isCurrentUserPremium = frozenWhile(() => props.isCurrentUserPremium, isClosing);
  const noPlay = frozenWhile(() => props.noPlay, isClosing);

  const { clearCustomEmojiForEmoji } = getActions();

  // Deviation: the container lives inside a `<Show>`, so its element is a signal (the hooks below read it when they run).
  const [containerEl, setContainerEl] = createSignal<HTMLDivElement | undefined>(undefined);
  const hasCustomEmoji = createMemo(() => Boolean(customEmoji()?.length));

  useHorizontalScroll(containerEl, () => !props.isOpen || !hasCustomEmoji());

  const { observe: observeIntersection } = useIntersectionObserver({
    rootRef: containerEl,
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
      <RichEditorTooltipPanel isOpen={props.isOpen}>
        <div ref={setContainerEl} class={className}>
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
