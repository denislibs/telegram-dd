import { createMemo } from 'frameact';
import { createMediaTransition } from '../../lib/kit';

import type { ApiAttachment, ApiDocument, ApiPhoto, ApiVideo, MediaContent } from '../../api/types';
import type { IconName } from '../../types/icons';

import { getDocumentMediaHash, getMediaThumbUri, getPhotoMediaHash, getVideoMediaHash } from '../../global/helpers';
import { IS_CANVAS_FILTER_SUPPORTED } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';
import { REM } from './helpers/mediaDimensions';

import useAppLayout from '../../hooks/useAppLayout';
import useCanvasBlur from '../../hooks/useCanvasBlur';
import { useIsIntersecting } from '../../hooks/useIntersectionObserver';
import useMedia from '../../hooks/useMedia';

import OptimizedVideo from '../ui/OptimizedVideo';
import Icon from './icons/Icon';
import MediaSpoiler from './MediaSpoiler';

import styles from './CompactMediaPreview.module.scss';

const PICTOGRAM_SIZE = 2 * REM;

type OwnProps = {
  id?: string;
  className?: string;
  media?: MediaContent;
  attachment?: ApiAttachment;
  size?: number;
  isPictogram?: boolean;
  isRound?: boolean;
  isProtected?: boolean;
  isSpoiler?: boolean;
  actionIcon?: IconName;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
};

export function canRenderCompactMediaPreview(media?: MediaContent, attachment?: ApiAttachment) {
  const photo = media?.photo;
  const document = media?.document;
  const previewUrl = getPreviewUrl(photo, document, media?.video, attachment);
  const video = media?.video || attachment?.gif;
  const shouldRenderPreviewAsVideo = shouldUseVideoPreview(video, previewUrl);
  const previewVideoUrl = !previewUrl
    ? video?.blobUrl || (shouldRenderPreviewAsVideo ? attachment?.blobUrl : undefined)
    : undefined;
  const previewHash = getPreviewHash(photo, document, video, shouldRenderPreviewAsVideo);

  return Boolean(
    previewUrl || previewVideoUrl || previewHash || getThumbDataUri(photo, document, media?.video, attachment),
  );
}

const CompactMediaPreview = (props: OwnProps) => {
  let ref!: HTMLDivElement;
  const { isMobile } = useAppLayout();

  const previewSize = createMemo(() => props.size || (props.isPictogram ? PICTOGRAM_SIZE : undefined));
  const photo = createMemo(() => props.media?.photo);
  const document = createMemo(() => props.media?.document);
  const video = createMemo(() => props.media?.video || props.attachment?.gif);
  const previewUrl = createMemo(() => getPreviewUrl(photo(), document(), props.media?.video, props.attachment));
  const shouldRenderPreviewAsVideo = createMemo(() => shouldUseVideoPreview(video(), previewUrl()));

  const isIntersectingForLoading = useIsIntersecting(() => ref, () => props.observeIntersectionForLoading);
  const isIntersectingForPlaying = createMemo(() => useIsIntersecting(() => ref, () => props.observeIntersectionForPlaying) && isIntersectingForLoading);

  const previewHash = createMemo(() => getPreviewHash(photo(), document(), video(), shouldRenderPreviewAsVideo()));

  const previewVideoUrl = createMemo(() => !previewUrl()
    ? video()?.blobUrl || (shouldRenderPreviewAsVideo() ? props.attachment?.blobUrl : undefined)
    : undefined);
  const thumbDataUri = createMemo(() => getThumbDataUri(photo(), document(), props.media?.video, props.attachment));

  const fetchedPreviewUrl = useMedia(
    () => previewHash(),
    () => Boolean(!previewHash() || previewUrl() || previewVideoUrl() || !isIntersectingForLoading),
  );

  const resolvedPreviewUrl = createMemo(() => previewUrl() || (!shouldRenderPreviewAsVideo() ? fetchedPreviewUrl : undefined));
  const resolvedPreviewVideoUrl = createMemo(() => previewVideoUrl() || (shouldRenderPreviewAsVideo() ? fetchedPreviewUrl : undefined));
  const shouldShowSpoiler = createMemo(() => props.isSpoiler ?? photo()?.isSpoiler ?? props.media?.video?.isSpoiler ?? props.attachment?.shouldSendAsSpoiler);

  const hasResolvedMedia = createMemo(() => Boolean(resolvedPreviewUrl() || resolvedPreviewVideoUrl()));
  const shouldShowCanvasThumb = createMemo(() => Boolean(thumbDataUri() && (shouldShowSpoiler() || !hasResolvedMedia())));
  const canvasRef = useCanvasBlur(
    () => thumbDataUri(),
    () => !thumbDataUri() || !shouldShowCanvasThumb(),
    isMobile && !IS_CANVAS_FILTER_SUPPORTED,
    undefined,
    () => previewSize(),
    () => previewSize(),
  );
  createMediaTransition({
    // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
    ref: canvasRef,
    hasMediaData: () => shouldShowCanvasThumb(),
  });

  const { ref: imageRef } = createMediaTransition({
    hasMediaData: () => Boolean(resolvedPreviewUrl() && !shouldShowSpoiler()),
  });
  const { ref: videoRef } = createMediaTransition({
    hasMediaData: () => Boolean(resolvedPreviewVideoUrl() && !shouldShowSpoiler()),
  });

  const spoilerThumbDataUri = createMemo(() => thumbDataUri() || resolvedPreviewUrl());
  const style = createMemo(() => previewSize() ? `width: ${previewSize()}px; height: ${previewSize()}px` : undefined);

  return (
    <div
      ref={ref}
      id={props.id}
      class={buildClassName(
        styles.root,
        props.className,
        props.isPictogram && styles.pictogram,
        props.isRound && styles.round,
        props.actionIcon && styles.withActionIcon,
        props.onClick && styles.interactive,
      )}
      style={style()}
      onClick={(e) => props.onClick?.(e)}
    >
      {thumbDataUri() && <canvas ref={canvasRef} class={buildClassName('thumbnail', styles.thumb)} />}
      {!shouldShowSpoiler() && resolvedPreviewUrl() && (
        <img
          ref={imageRef}
          src={resolvedPreviewUrl()}
          alt=""
          class={buildClassName('full-media', styles.media)}
          draggable={false}
        />
      )}
      {!shouldShowSpoiler() && resolvedPreviewVideoUrl() && (
        <OptimizedVideo
          ref={videoRef}
          className={buildClassName('full-media', styles.media)}
          src={resolvedPreviewVideoUrl()}
          canPlay={isIntersectingForPlaying()}
          poster={thumbDataUri()}
          loop
          playsInline
          muted
          disablePictureInPicture
        />
      )}
      <MediaSpoiler
        thumbDataUri={spoilerThumbDataUri()}
        isVisible={Boolean(shouldShowSpoiler())}
        width={previewSize()}
        height={previewSize()}
      />
      {props.isProtected && <span class={buildClassName('protector', styles.protector)} />}
      {props.actionIcon && <Icon name={props.actionIcon} className={styles.actionIcon} />}
    </div>
  );
};

function getThumbDataUri(photo?: ApiPhoto, document?: ApiDocument, video?: ApiVideo, attachment?: ApiAttachment) {
  return (
    (photo && getMediaThumbUri(photo)) ||
    (document && getMediaThumbUri(document)) ||
    (video && getMediaThumbUri(video)) ||
    attachment?.previewBlobUrl ||
    (attachment?.mimeType.startsWith('image/') ? attachment.blobUrl : undefined)
  );
}

function getPreviewUrl(photo?: ApiPhoto, document?: ApiDocument, video?: ApiVideo, attachment?: ApiAttachment) {
  return (
    photo?.blobUrl ||
    document?.previewBlobUrl ||
    video?.previewBlobUrl ||
    attachment?.previewBlobUrl ||
    (attachment?.mimeType.startsWith('image/') ? attachment.blobUrl : undefined)
  );
}

function shouldUseVideoPreview(video: ApiVideo | undefined, previewUrl?: string) {
  return Boolean(video?.isGif && !video.previewPhotoSizes?.length && !previewUrl);
}

function getPreviewHash(
  photo?: ApiPhoto,
  document?: ApiDocument,
  video?: ApiVideo,
  shouldRenderPreviewAsVideo?: boolean,
) {
  if (photo) {
    return getPhotoMediaHash(photo, 'pictogram');
  }

  if (document) {
    return getDocumentMediaHash(document, 'pictogram');
  }

  if (video) {
    return getVideoMediaHash(video, shouldRenderPreviewAsVideo ? 'full' : 'pictogram');
  }

  return undefined;
}

export default CompactMediaPreview;
