import { createEffect, createMemo } from 'frameact';
import { splitProps } from 'frameact/dom';

import useBuffering from '../../hooks/useBuffering';
import useVideoCleanup from '../../hooks/useVideoCleanup';
import useVideoAutoPause from '../middle/message/hooks/useVideoAutoPause';

type VideoProps = React.DetailedHTMLProps<React.VideoHTMLAttributes<HTMLVideoElement>, HTMLVideoElement>;

type OwnProps = {
  ref?: (el: HTMLVideoElement) => void;
  isPriority?: boolean;
  canPlay: boolean;
  children?: React.ReactNode;
  onReady?: NoneToVoidFunction;
  onBroken?: NoneToVoidFunction;
} & VideoProps;

function OptimizedVideo(props: OwnProps) {
  const [, restProps] = splitProps(props, [
    'ref',
    'isPriority',
    'canPlay',
    'children',
    'onReady',
    'onBroken',
    'onTimeUpdate',
  ]);
  let localRef!: HTMLVideoElement;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (!props.ref) {
    // TODO(codemod): "ref" was a destructured prop and is assigned here: props are read-only getters
    // TODO(codemod): "localRef" was a ref object passed as a value: pass an accessor (() => localRef) or a callback ref
    ref = localRef;
  }

  const videoAutoPauseResult = createMemo(() =>
    useVideoAutoPause(
      props.ref,
      () => props.canPlay,
      () => props.isPriority,
    ),
  );
  const handlePlayingForAutoPause = () => videoAutoPauseResult().handlePlaying;

  let isReadyRef = false;
  const handleReady = () => {
    if (!isReadyRef) {
      props.onReady?.();
      isReadyRef = true;
    }
  };

  // This is only needed for browsers not allowing autoplay
  const bufferingResult = createMemo(() => useBuffering(true, props.onTimeUpdate, props.onBroken));
  const isBuffered = () => bufferingResult().isBuffered;
  const bufferingHandlers = () => bufferingResult().bufferingHandlers;
  // TODO(codemod): destructuring of a reactive object with a nested/rest pattern: read the fields through accessors
  const { onPlaying: handlePlayingForBuffering, ...otherBufferingHandlers } = bufferingHandlers();
  // TODO(codemod): useSyncEffect ran synchronously during render: createMemo for derived state, createMeasureEffect for a snapshot before the DOM update
  createEffect(
    () => [isBuffered(), handleReady],
    (_deps, prev) => {
      const [prevIsBuffered] = prev ?? [];
      if (prevIsBuffered === undefined) {
        return;
      }

      handleReady();
    },
  );

  const handlePlaying = (e) => {
    handlePlayingForAutoPause()();
    handlePlayingForBuffering(e);
    handleReady();
    restProps.onPlaying?.(e);
  };

  const mergedOtherBufferingHandlers = createMemo(() => {
    const mergedHandlers: Record<string, AnyFunction> = {};
    Object.keys(otherBufferingHandlers).forEach((keyString) => {
      const key = keyString as keyof typeof otherBufferingHandlers;
      mergedHandlers[key] = (event: Event) => {
        restProps[key as keyof typeof restProps]?.(event);
        otherBufferingHandlers[key]?.(event);
      };
    });

    return mergedHandlers;
  });

  useVideoCleanup(props.ref, () => mergedOtherBufferingHandlers());

  return (
    <video ref={props.ref} autoPlay {...restProps} {...mergedOtherBufferingHandlers()} onPlaying={handlePlaying}>
      {props.children}
    </video>
  );
}

export default OptimizedVideo;
