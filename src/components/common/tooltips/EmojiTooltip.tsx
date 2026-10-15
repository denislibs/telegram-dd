import { createMemo, frozenWhile } from 'frameact';
import { For, Show, splitProps } from 'frameact/dom';

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

const EmojiTooltip = (p: OwnProps) => {
  const [, props] = splitProps(p, ['isOpen']);
  const frozen = frozenWhile(
    () => props,
    () => !p.isOpen,
  );
  const selectedIndex = () => frozen().selectedIndex;
  const emojis = () => frozen().emojis;
  const customEmojis = () => frozen().customEmojis;
  const onEmojiSelect = () => frozen().onEmojiSelect;
  const onCustomEmojiSelect = () => frozen().onCustomEmojiSelect;

  let containerRef!: HTMLDivElement;
  const listEmojis = createMemo<(Emoji | ApiSticker)[]>(() => [...emojis(), ...customEmojis()]);
  const hasEmojis = createMemo(() => Boolean(listEmojis().length));

  useHorizontalScroll(
    () => containerRef,
    () => !p.isOpen || !hasEmojis(),
  );

  const { observe: observeIntersection } = useIntersectionObserver({
    rootRef: () => containerRef,
    throttleMs: INTERSECTION_THROTTLE,
  });

  return (
    <Show when={hasEmojis()}>
      <RichEditorTooltipPanel isOpen={p.isOpen}>
        <div ref={containerRef} class={buildClassName(sharedStyles.root, styles.root, 'composer-tooltip no-scrollbar')}>
          <For each={listEmojis()}>
            {(emoji, index) =>
              'native' in emoji ? (
                <EmojiButton emoji={emoji} focus={selectedIndex() === index()} onClick={onEmojiSelect()} />
              ) : (
                <CustomEmojiButton
                  emoji={emoji}
                  focus={selectedIndex() === index()}
                  onClick={onCustomEmojiSelect()}
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
