import { createMemo } from 'frameact';
import { For, Show } from 'frameact/dom';

import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { EMOJI_SIZE_PICKER } from '../../../config';
import { createMediaTransition } from '../../../lib/kit';
import windowSize from '../../../util/windowSize';
import { REM } from '../../common/helpers/mediaDimensions';

import useAppLayout from '../../../hooks/useAppLayout';
import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useOldLang from '../../../hooks/useOldLang';

import EmojiButton from './EmojiButton';

const EMOJIS_PER_ROW_ON_DESKTOP = 8;
const EMOJI_MARGIN = 0.625 * REM;
const EMOJI_VERTICAL_MARGIN = 0.25 * REM;
const EMOJI_VERTICAL_MARGIN_MOBILE = 0.5 * REM;
const MOBILE_CONTAINER_PADDING = 0.5 * REM;

type OwnProps = {
  category: EmojiCategory;
  sectionId: string;
  title: string;
  allEmojis: AllEmojis;
  observeIntersection: ObserveFn;
  shouldRender: boolean;
  onEmojiSelect: (emoji: string, name: string) => void;
};

const EmojiCategory = (props: OwnProps) => {
  let ref!: HTMLDivElement;

  const isIntersecting = useIsIntersecting(
    () => ref,
    () => props.observeIntersection,
  );
  const shouldRenderContent = createMemo(() => props.shouldRender || isIntersecting());

  // Deviation: the transition classes are written through the element ref (`t.ref`), not a class string.
  const transition = createMediaTransition({ hasMediaData: shouldRenderContent });

  const lang = useOldLang();
  const { isMobile } = useAppLayout();

  const emojisPerRow = createMemo(() =>
    isMobile()
      ? Math.floor(
          (windowSize.get().width - MOBILE_CONTAINER_PADDING + EMOJI_MARGIN) / (EMOJI_SIZE_PICKER + EMOJI_MARGIN),
        )
      : EMOJIS_PER_ROW_ON_DESKTOP,
  );
  const height = createMemo(
    () =>
      Math.ceil(props.category.emojis.length / emojisPerRow()) *
      (EMOJI_SIZE_PICKER + (isMobile() ? EMOJI_VERTICAL_MARGIN_MOBILE : EMOJI_VERTICAL_MARGIN)),
  );

  // Deviation: no `key={category.id}` on the root; the parent lists categories with `<For keyed>`, so a category is
  // a component instance of its own.
  return (
    <div ref={ref} id={props.sectionId} class="symbol-set">
      <div class="symbol-set-header">
        <p class="symbol-set-name" dir="auto">
          {props.title}
        </p>
      </div>
      <div
        ref={transition.ref}
        class="symbol-set-container"
        style={`height: ${height()}px;`}
        dir={lang.isRtl ? 'rtl' : undefined}
      >
        <Show when={shouldRenderContent()}>
          <For each={props.category.emojis} keyed={(name) => name}>
            {(name) => {
              const displayedEmoji = createMemo(() => {
                const emoji = props.allEmojis[name()];
                // Recent emojis may contain emoticons that are no longer in the list
                if (!emoji) {
                  return undefined;
                }
                // Some emojis have multiple skins and are represented as an Object with emojis for all skins.
                // For now, we select only the first emoji with 'neutral' skin.
                return 'id' in emoji ? emoji : emoji[1];
              });

              return (
                <Show when={displayedEmoji()}>
                  {(emoji) => <EmojiButton emoji={emoji()} onClick={props.onEmojiSelect} />}
                </Show>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default EmojiCategory;
