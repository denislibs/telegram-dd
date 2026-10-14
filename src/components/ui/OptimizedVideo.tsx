import { createEffect } from 'frameact';
import { splitProps } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import useBuffering from '../../hooks/useBuffering';
import useVideoCleanup from '../../hooks/useVideoCleanup';
import useVideoAutoPause from '../middle/message/hooks/useVideoAutoPause';

type VideoProps = JSX.VideoHTMLAttributes<HTMLVideoElement>;

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
  let videoElement: HTMLVideoElement | undefined;
  const getVideoElement = () => videoElement;

  const { handlePlaying: handlePlayingForAutoPause } = useVideoAutoPause(
    getVideoElement,
    () => props.canPlay,
    () => props.isPriority,
  );

  let isReadyRef = false;
  const handleReady = () => {
    if (!isReadyRef) {
      props.onReady?.();
      isReadyRef = true;
    }
  };

  // This is only needed for browsers not allowing autoplay
  const { isBuffered, bufferingHandlers } = useBuffering(
    true,
    (e) => (props.onTimeUpdate as AnyFunction | undefined)?.(e),
    () => props.onBroken?.(),
  );
  const { onPlaying: handlePlayingForBuffering, ...otherBufferingHandlers } = bufferingHandlers;
  createEffect(
    () => isBuffered(),
    (_isBuffered, prevIsBuffered) => {
      if (prevIsBuffered === undefined) {
        return;
      }

      handleReady();
    },
  );

  const handlePlaying = (e: Event) => {
    handlePlayingForAutoPause();
    handlePlayingForBuffering(e);
    handleReady();
    (restProps.onPlaying as AnyFunction | undefined)?.(e);
  };

  const mergedOtherBufferingHandlers: Record<string, AnyFunction> = {};
  Object.keys(otherBufferingHandlers).forEach((keyString) => {
    const key = keyString as keyof typeof otherBufferingHandlers;
    mergedOtherBufferingHandlers[key] = (event: Event) => {
      (restProps[key as keyof typeof restProps] as AnyFunction | undefined)?.(event);
      otherBufferingHandlers[key]?.(event);
    };
  });

  useVideoCleanup(getVideoElement);

  return (
    <video
      ref={(el) => {
        videoElement = el;
        props.ref?.(el);
      }}
      autoplay
      {...restProps}
      {...mergedOtherBufferingHandlers}
      onPlaying={handlePlaying}
    >
      {props.children}
    </video>
  );
}

export default OptimizedVideo;
