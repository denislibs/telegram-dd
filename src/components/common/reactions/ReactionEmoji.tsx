import { type Accessor, createEffect, createMemo } from 'frameact';
import { Show } from 'frameact/dom';

import type { ApiAvailableReaction, ApiReactionWithPaid } from '../../../api/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

import { EMOJI_SIZE_PICKER } from '../../../config';
import { getDocumentMediaHash, isSameReaction } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';
import { LOCAL_TGS_URLS } from '../helpers/animatedAssets';

import useContextMenuHandlers from '../../../hooks/useContextMenuHandlers';
import useCoordsInSharedCanvas from '../../../hooks/useCoordsInSharedCanvas';
import useMedia from '../../../hooks/useMedia';

import AnimatedIconWithPreview from '../AnimatedIconWithPreview';
import CustomEmoji from '../CustomEmoji';

import styles from './ReactionEmoji.module.scss';

type OwnProps = {
  reaction: ApiReactionWithPaid;
  availableReactions?: ApiAvailableReaction[];
  className?: string;
  isSelected?: boolean;
  loadAndPlay?: boolean;
  observeIntersection?: ObserveFn;
  sharedCanvasRef?: Accessor<HTMLCanvasElement | undefined>;
  sharedCanvasHqRef?: Accessor<HTMLCanvasElement | undefined>;
  forcePlayback?: boolean;
  onClick: (reaction: ApiReactionWithPaid) => void;
  onContextMenu?: (reaction: ApiReactionWithPaid) => void;
};

const ReactionEmoji = (props: OwnProps) => {
  let ref!: HTMLDivElement;
  const isCustom = createMemo(() => props.reaction.type === 'custom');
  const availableReaction = createMemo(() =>
    props.availableReactions?.find((available) => isSameReaction(available.reaction, props.reaction)),
  );
  const customDocumentId = createMemo(() => (props.reaction.type === 'custom' ? props.reaction.documentId : undefined));
  const thumbDataUri = createMemo(() => availableReaction()?.staticIcon?.thumbnail?.dataUri);
  const animationId = createMemo(() => availableReaction()?.selectAnimation?.id);
  const coords = useCoordsInSharedCanvas(() => ref, props.sharedCanvasRef);
  const mediaData = useMedia(
    () => {
      const selectAnimation = availableReaction()?.selectAnimation;
      return selectAnimation ? getDocumentMediaHash(selectAnimation, 'full') : undefined;
    },
    () => !animationId(),
  );

  const {
    isContextMenuOpen,
    handleBeforeContextMenu,
    handleContextMenu,
    handleContextMenuClose,
    handleContextMenuHide,
  } = useContextMenuHandlers(
    () => ref,
    () => props.reaction.type !== 'paid',
    undefined,
    undefined,
    undefined,
    true,
  );

  createEffect(
    depsOf(() => [isContextMenuOpen(), props.onContextMenu, props.reaction] as const),
    ([isContextMenuOpen2, onContextMenu2, reaction2]) => {
      if (isContextMenuOpen2) {
        onContextMenu2?.(reaction2);

        handleContextMenuClose();
        handleContextMenuHide();
      }
    },
  );

  const tgsUrl = createMemo(() => (props.reaction.type === 'paid' ? LOCAL_TGS_URLS.StarReaction : mediaData()));
  const handleClick = () => {
    props.onClick(props.reaction);
  };

  // TODO(port): tt applied `useMediaTransitionDeprecated(mediaData)` classes to the root of `AnimatedIconWithPreview` through
  // its `className`. That component has no root ref, and a transition on the element it forwards `ref` to (the sticker)
  // would fight the one `AnimatedIcon` already runs there, so the wrapper is shown at once (preview first, sticker
  // fades in with `AnimatedIcon`'s own transition).
  const fullClassName = createMemo(() =>
    buildClassName(styles.root, props.isSelected && styles.selected, !isCustom() && 'sticker-reaction'),
  );

  return (
    <div
      ref={ref}
      class={fullClassName()}
      onClick={handleClick}
      title={availableReaction()?.title}
      data-sticker-id={customDocumentId()}
      onMouseDown={handleBeforeContextMenu}
      onContextMenu={handleContextMenu}
    >
      <Show
        when={isCustom()}
        fallback={
          <AnimatedIconWithPreview
            tgsUrl={tgsUrl()}
            thumbDataUri={thumbDataUri()}
            play={props.loadAndPlay}
            noLoop={false}
            size={EMOJI_SIZE_PICKER}
            isLowPriority
            sharedCanvas={props.sharedCanvasRef?.() || undefined}
            sharedCanvasCoords={coords()}
            forceAlways={props.forcePlayback}
          />
        }
      >
        <CustomEmoji
          // tt passed its own `ref` here, so after mounting it pointed at the inner element of `CustomEmoji`
          // (the coordinates and the context menu listener use that element); the same is kept.
          ref={(el) => {
            ref = el;
          }}
          documentId={customDocumentId()!}
          size={EMOJI_SIZE_PICKER}
          noPlay={!props.loadAndPlay}
          observeIntersectionForPlaying={props.observeIntersection}
          sharedCanvasRef={props.sharedCanvasRef}
          sharedCanvasHqRef={props.sharedCanvasHqRef}
          withTranslucentThumb
          forceAlways={props.forcePlayback}
        />
      </Show>
    </div>
  );
};

export default ReactionEmoji;
