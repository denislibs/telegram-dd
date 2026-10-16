import { createMemo } from 'frameact';
import { For, Show } from 'frameact/dom';
import { getActions } from '../../global';

import type { ApiSticker, ApiStickerSet } from '../../api/types';
import type { ObserveFn } from '../../hooks/useIntersectionObserver';

import { selectStickerSet } from '../../global/selectors';
import renderText from './helpers/renderText';

import useSelector from '../../hooks/data/useSelector';
import useContentWidth from '../../hooks/useContentWidth';
import useLang from '../../hooks/useLang';

import Button from '../ui/Button';
import Loading from '../ui/Loading';
import Transition from '../ui/Transition';
import StickerButton from './StickerButton';

import styles from './InlineStickerSetView.module.scss';

type OwnProps = {
  stickerSet: ApiStickerSet;
  stickerSize: number;
  observeIntersection: ObserveFn;
  noPlay?: boolean;
  noContextMenus?: boolean;
  isSavedMessages?: boolean;
  isCurrentUserPremium?: boolean;
  isTranslucent?: boolean;
  onStickerSelect?: (sticker: ApiSticker) => void;
};

const InlineStickerSetView = (props: OwnProps) => {
  return (
    <div class={styles.root}>
      <div class={styles.header}>
        <p class={styles.title}>{renderText(props.stickerSet.title, ['emoji', 'links'])}</p>
      </div>
      <Show when={props.stickerSet.stickers?.length} fallback={<Loading />}>
        <div class={styles.grid} style={`--inline-set-item-size: ${props.stickerSize / 16}rem`}>
          <For each={props.stickerSet.stickers} keyed={(sticker) => sticker.id}>
            {(sticker) => (
              <StickerButton
                sticker={sticker()}
                size={props.stickerSize}
                observeIntersection={props.observeIntersection}
                noPlay={props.noPlay}
                noContextMenu={props.noContextMenus}
                isSavedMessages={props.isSavedMessages}
                isCurrentUserPremium={props.isCurrentUserPremium}
                withTranslucentThumb={props.isTranslucent}
                onClick={props.onStickerSelect}
                clickArg={sticker()}
                forcePlayback
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default InlineStickerSetView;

export function StickerSetToggleButton(props: { stickerSet: ApiStickerSet }) {
  const { toggleStickerSet } = getActions();

  let buttonRef: HTMLButtonElement | undefined;
  let labelRef!: HTMLSpanElement;

  const lang = useLang();

  const isRegistered = useSelector((global) => Boolean(selectStickerSet(global, props.stickerSet.id)));

  const isAdded = createMemo(() => Boolean(!props.stickerSet.isArchived && props.stickerSet.installedDate));
  const suffix = createMemo(() => (props.stickerSet.isEmoji ? 'Emoji' : 'Sticker'));
  const getLabel = (isAdded2: boolean) =>
    lang(
      isAdded2 ? `StickerPackRemove${suffix()}Count` : `StickerPackAdd${suffix()}Count`,
      { count: props.stickerSet.count },
      { pluralValue: props.stickerSet.count },
    );
  const label = createMemo(() => getLabel(isAdded()));

  useContentWidth(
    () => buttonRef,
    () => labelRef,
    () => [label()],
  );

  const handleClick = () => {
    toggleStickerSet({ stickerSetId: props.stickerSet.id });
  };

  return (
    <Button
      ref={(el) => {
        buttonRef = el as HTMLButtonElement;
      }}
      className={styles.toggleButton}
      size="tiny"
      color={isAdded() ? 'danger' : 'primary'}
      pill
      noClickTransitionReset
      disabled={!isRegistered()}
      onClick={handleClick}
    >
      <span ref={labelRef} class={styles.toggleMeasure} aria-hidden="true">
        {label()}
      </span>
      {/* Deviation: each slide renders the label of its own key (1: added, 0: not added), so the outgoing slide keeps
          its text while it fades out (tt cached the children of an inactive slide). */}
      <Transition name="fade" activeKey={isAdded() ? 1 : 0} className={styles.toggleTransition} shouldCleanup>
        {(slide) => <span class={styles.toggleLabel}>{getLabel(slide.key === 1)}</span>}
      </Transition>
    </Button>
  );
}
