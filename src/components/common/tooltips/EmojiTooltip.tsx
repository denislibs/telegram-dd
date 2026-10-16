import { createMemo, createSignal, frozenWhile } from 'frameact';
import { For, Show } from 'frameact/dom';

import type { ApiSticker } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';

import useHorizontalScroll from '../../../hooks/useHorizontalScroll';
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver';

import CustomEmojiButton from '../../middle/composer/CustomEmojiButton';
import EmojiButton from '../../middle/composer/EmojiButton';
import RichEditorTooltipPanel from './RichEditorTooltipPanel';

import styles from './EmojiTooltip.module.scss';
import sharedStyles from './RichEditorTooltip.module.scss';

export type OwnProps = {
  isOpen: boolean;
  selectedIndex: number;
  emojis: Emoji[];
  customEmojis: ApiSticker[];
  onEmojiSelect: (text: string) => void;
  onCustomEmojiSelect: (emoji: ApiSticker) => void;
};

const INTERSECTION_THROTTLE = 200;

const EmojiTooltip = (props: OwnProps) => {
  const isClosing = () => !props.isOpen;
  const selectedIndex = frozenWhile(() => props.selectedIndex, isClosing);
  const emojis = frozenWhile(() => props.emojis, isClosing);
  const customEmojis = frozenWhile(() => props.customEmojis, isClosing);
  const onEmojiSelect = frozenWhile(() => props.onEmojiSelect, isClosing);
  const onCustomEmojiSelect = frozenWhile(() => props.onCustomEmojiSelect, isClosing);

  // Deviation: the container lives inside a `<Show>`, so its element is a signal (the hooks below read it when they run).
  const [containerEl, setContainerEl] = createSignal<HTMLDivElement | undefined>(undefined);
  const listEmojis = createMemo<(Emoji | ApiSticker)[]>(() => [...emojis(), ...customEmojis()]);
  const hasEmojis = createMemo(() => Boolean(listEmojis().length));

  useHorizontalScroll(containerEl, () => !props.isOpen || !hasEmojis());

  const { observe: observeIntersection } = useIntersectionObserver({
    rootRef: containerEl,
    throttleMs: INTERSECTION_THROTTLE,
  });

  return (
    <Show when={hasEmojis()}>
      <RichEditorTooltipPanel isOpen={props.isOpen}>
        <div
          ref={setContainerEl}
          class={buildClassName(sharedStyles.root, styles.root, 'composer-tooltip no-scrollbar')}
        >
          <For each={listEmojis()}>
            {(emoji, index) =>
              'native' in emoji ? (
                <EmojiButton
                  emoji={emoji}
                  focus={selectedIndex() === index()}
                  onClick={(text) => onEmojiSelect()(text)}
                />
              ) : (
                <CustomEmojiButton
                  emoji={emoji}
                  focus={selectedIndex() === index()}
                  onClick={(customEmoji) => onCustomEmojiSelect()(customEmoji)}
                  observeIntersection={observeIntersection}
                />
              )
            }
          </For>
        </div>
      </RichEditorTooltipPanel>
    </Show>
  );
};

export default EmojiTooltip;
