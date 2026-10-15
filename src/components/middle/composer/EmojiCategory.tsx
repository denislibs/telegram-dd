import { createMemo } from 'frameact';
import { createMediaTransition } from '../../../lib/kit';

import { EMOJI_SIZE_PICKER } from '../../../config';
import buildClassName from '../../../util/buildClassName';
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
  const shouldRenderContent = createMemo(() => props.shouldRender || isIntersecting);

  // TODO(codemod): useMediaTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element
  const transitionClassNames = createMemo(() =>
    createMediaTransition({ hasMediaData: () => Boolean(shouldRenderContent()) }),
  );

  const lang = useOldLang();
  const { isMobile } = useAppLayout();

  const emojisPerRow = isMobile
    ? Math.floor(
        (windowSize.get().width - MOBILE_CONTAINER_PADDING + EMOJI_MARGIN) / (EMOJI_SIZE_PICKER + EMOJI_MARGIN),
      )
    : EMOJIS_PER_ROW_ON_DESKTOP;
  const height = createMemo(
    () =>
      Math.ceil(props.category.emojis.length / emojisPerRow) *
      (EMOJI_SIZE_PICKER + (isMobile ? EMOJI_VERTICAL_MARGIN_MOBILE : EMOJI_VERTICAL_MARGIN)),
  );

  return (
    // TODO(codemod): key= on a single element remounted it: wrap in <Show when={key} keyed>{(key) => …}</Show> (the callback MUST take an argument, a zero-argument child is a plain child and never remounts; a falsy key such as 0 renders nothing: use when={{ id: key }})
    <div ref={ref} key={props.category.id} id={props.sectionId} class="symbol-set">
      <div class="symbol-set-header">
        <p class="symbol-set-name" dir="auto">
          {props.title}
        </p>
      </div>
      <div
        class={buildClassName('symbol-set-container', transitionClassNames())}
        style={`height: ${height()}px;`}
        dir={lang.isRtl ? 'rtl' : undefined}
      >
        {shouldRenderContent() &&
          props.category.emojis.map((name) => {
            const emoji = props.allEmojis[name];
            // Recent emojis may contain emoticons that are no longer in the list
            if (!emoji) {
              return undefined;
            }
            // Some emojis have multiple skins and are represented as an Object with emojis for all skins.
            // For now, we select only the first emoji with 'neutral' skin.
            const displayedEmoji = 'id' in emoji ? emoji : emoji[1];

            return <EmojiButton emoji={displayedEmoji} onClick={props.onEmojiSelect} />;
          })}
      </div>
    </div>
  );
};

export default EmojiCategory;
