import { createEffect, createMemo } from 'frameact';
import { depsOf } from '../../../util/effectDeps';
import { createMediaTransition } from '../../../lib/kit';

import type { ApiAvailableReaction, ApiReactionWithPaid } from '../../../api/types';

import { EMOJI_SIZE_PICKER } from '../../../config';
import { getDocumentMediaHash, isSameReaction } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
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
  sharedCanvasRef?: (el: HTMLCanvasElement) => void;
  sharedCanvasHqRef?: (el: HTMLCanvasElement) => void;
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
  const thumbDataUri = createMemo(() => availableReaction()?.staticIcon?.thumbnail?.dataUri);
  const animationId = createMemo(() => availableReaction()?.selectAnimation?.id);
  const coords = useCoordsInSharedCanvas(() => ref, props.sharedCanvasRef);
  const mediaData = useMedia(
    availableReaction()?.selectAnimation
      ? getDocumentMediaHash(availableReaction().selectAnimation, 'full')
      : undefined,
    !animationId(),
  );

  const contextMenuHandlersResult = createMemo(() =>
    useContextMenuHandlers(
      () => ref,
      () => props.reaction.type !== 'paid',
      undefined,
      undefined,
      undefined,
      true,
    ),
  );
  const isContextMenuOpen = () => contextMenuHandlersResult().isContextMenuOpen;
  const handleBeforeContextMenu = () => contextMenuHandlersResult().handleBeforeContextMenu;
  const handleContextMenu = () => contextMenuHandlersResult().handleContextMenu;
  const handleContextMenuClose = () => contextMenuHandlersResult().handleContextMenuClose;
  const handleContextMenuHide = () => contextMenuHandlersResult().handleContextMenuHide;

  createEffect(
    depsOf(
      () =>
        [
          handleContextMenuClose(),
          props.onContextMenu,
          handleContextMenuHide(),
          isContextMenuOpen(),
          props.reaction,
        ] as const,
    ),
    ([handleContextMenuClose2, onContextMenu2, handleContextMenuHide2, isContextMenuOpen2, reaction2]) => {
      if (isContextMenuOpen2) {
        onContextMenu2?.(reaction2);

        handleContextMenuClose2();
        handleContextMenuHide2();
      }
    },
  );

  const tgsUrl = createMemo(() => (props.reaction.type === 'paid' ? LOCAL_TGS_URLS.StarReaction : mediaData));
  const handleClick = () => {
    props.onClick(props.reaction);
  };

  // TODO(codemod): useMediaTransitionDeprecated returned class names: apply the result through ref={t.ref} on the element
  const transitionClassNames = createMediaTransition({ hasMediaData: () => Boolean(mediaData) });
  const fullClassName = createMemo(() =>
    buildClassName(styles.root, props.isSelected && styles.selected, !isCustom() && 'sticker-reaction'),
  );

  return (
    <div
      ref={ref}
      class={fullClassName()}
      onClick={handleClick}
      title={availableReaction()?.title}
      data-sticker-id={isCustom() ? props.reaction.documentId : undefined}
      onMouseDown={handleBeforeContextMenu()}
      onContextMenu={handleContextMenu()}
    >
      {isCustom() ? (
        <CustomEmoji
          ref={ref}
          documentId={props.reaction.documentId}
          size={EMOJI_SIZE_PICKER}
          noPlay={!props.loadAndPlay}
          observeIntersectionForPlaying={props.observeIntersection}
          sharedCanvasRef={props.sharedCanvasRef}
          sharedCanvasHqRef={props.sharedCanvasHqRef}
          withTranslucentThumb
          forceAlways={props.forcePlayback}
        />
      ) : (
        <AnimatedIconWithPreview
          tgsUrl={tgsUrl()}
          thumbDataUri={thumbDataUri()}
          play={props.loadAndPlay}
          noLoop={false}
          size={EMOJI_SIZE_PICKER}
          isLowPriority
          className={transitionClassNames}
          sharedCanvas={props.sharedCanvasRef!.current || undefined}
          sharedCanvasCoords={coords}
          forceAlways={props.forcePlayback}
        />
      )}
    </div>
  );
};

export default ReactionEmoji;
