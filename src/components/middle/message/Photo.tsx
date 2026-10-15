import { createEffect, createMemo, createMutationEffect, createSignal, previous, requestMutation } from 'frameact';
import { getActions, withGlobal } from '../../../global';
import { createMediaTransition, createShowTransition } from '../../../lib/kit';
import { depsOf } from '../../../util/effectDeps';
import type { GlobalState } from '../../../global/types';

import type { ApiMediaExtendedPreview, ApiPhoto } from '../../../api/types';
import type { ThemeKey } from '../../../types';

import { CUSTOM_APPENDIX_ATTRIBUTE, MESSAGE_CONTENT_SELECTOR } from '../../../config';
import {
  getMediaDimensions,
  getMediaFormat,
  getMediaThumbUri,
  getMediaTransferState,
  getPhotoMediaHash,
} from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import getCustomAppendixBg from './helpers/getCustomAppendixBg';

import useFlag from '../../../hooks/useFlag';
import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useMediaWithLoadProgress from '../../../hooks/useMediaWithLoadProgress';
import useBlurredMediaThumbRef from './hooks/useBlurredMediaThumbRef';

import Icon from '../../common/icons/Icon';
import MediaSpoiler from '../../common/MediaSpoiler';
import SensitiveContentConfirmModal from '../../common/SensitiveContentConfirmModal';
import ProgressSpinner from '../../ui/ProgressSpinner';
import MediaBadge from './MediaBadge';

import styles from './media.module.scss';

export type OwnProps<T> = {
  id?: string;
  photo: ApiPhoto | ApiMediaExtendedPreview;
  isOwn?: boolean;
  canAutoLoad?: boolean;
  isInSelectMode?: boolean;
  isSelected?: boolean;
  uploadProgress?: number;
  size?: 'inline' | 'pictogram';
  layout?: 'intrinsic' | 'fill';
  shouldAffectAppendix?: boolean;
  nonInteractive?: boolean;
  noSpoilerReveal?: boolean;
  isDownloading?: boolean;
  isProtected?: boolean;
  theme: ThemeKey;
  className?: string;
  clickArg?: T;
  isMediaNsfw?: boolean;
  observeIntersection?: ObserveFn;
  onClick?: (arg: T, e: React.MouseEvent<HTMLElement>) => void;
  onCancelUpload?: (arg: T) => void;
};

type StateProps = {
  needsAgeVerification?: boolean;
};

const Photo = <T,>(ownProps: OwnProps<T>) => {
  const props = withGlobal(ownProps, mapStateToProps);
  let ref!: HTMLDivElement;
  const isPaidPreview = createMemo(() => props.photo.mediaType === 'extendedMediaPreview');
  const getMediaDimensionsResult = createMemo(() => getMediaDimensions(props.photo));
  const width = () => getMediaDimensionsResult().width;
  const height = () => getMediaDimensionsResult().height;

  const localBlobUrl = createMemo(() => !isPaidPreview() ? props.photo.blobUrl : undefined);

  const isIntersecting = useIsIntersecting(() => ref, () => props.observeIntersection);

  const [isLoadAllowed, setIsLoadAllowed] = createSignal(props.canAutoLoad);
  const shouldLoad = createMemo(() => isLoadAllowed() && isIntersecting && !isPaidPreview());
  const mediaWithLoadProgressResult = createMemo(() => useMediaWithLoadProgress(
    () => !isPaidPreview() ? getPhotoMediaHash(props.photo, (props.size === undefined ? 'inline' : props.size)) : undefined,
    () => !shouldLoad(),
  ));
  const mediaData = () => mediaWithLoadProgressResult().mediaData;
  const loadProgress = () => mediaWithLoadProgressResult().loadProgress;
  const prevMediaData = previous(() => mediaData());
  const fullMediaData = createMemo(() => localBlobUrl() || mediaData());

  const { ref: fullMediaRef, shouldRender: shouldRenderFullMedia } = createMediaTransition({
    hasMediaData: () => Boolean(fullMediaData()),
  });

  const withBlurredBackground = createMemo(() => (props.layout === undefined ? 'intrinsic' : props.layout) !== 'fill' && (props.size === undefined ? 'inline' : props.size) === 'inline');
  const [withThumb] = createSignal(!fullMediaData());
  const noThumb = createMemo(() => Boolean(fullMediaData()));
  const thumbRef = useBlurredMediaThumbRef(() => props.photo, () => noThumb());
  // TODO(codemod): ref option: hand the result `ref` to the element (ref={t.ref}) instead
  createMediaTransition({ ref: thumbRef, hasMediaData: () => !noThumb() });
  const blurredBackgroundRef = useBlurredMediaThumbRef(() => props.photo, () => !withBlurredBackground());
  const thumbDataUri = createMemo(() => getMediaThumbUri(props.photo));

  const { updateContentSettings, openAgeVerificationModal } = getActions();
  const [isNsfwModalOpen, openNsfwModal, closeNsfwModal] = useFlag();
  const [shouldAlwaysShowNsfw, setShouldAlwaysShowNsfw] = createSignal(false);

  const shouldShowSpoiler = createMemo(() => isPaidPreview() || props.photo.isSpoiler || props.isMediaNsfw);
  const [isSpoilerShown, showSpoiler, hideSpoiler] = useFlag(shouldShowSpoiler());

  createEffect(() => shouldShowSpoiler(), (shouldShowSpoiler2) => {
    if (shouldShowSpoiler2) {
      showSpoiler();
    } else {
      hideSpoiler();
    }
  });

  const handleNsfwConfirm = () => {
    closeNsfwModal();
    hideSpoiler();

    if (shouldAlwaysShowNsfw()) {
      updateContentSettings({ isSensitiveEnabled: true });
    }
  };

  const mediaWithLoadProgressResult2 = createMemo(() => useMediaWithLoadProgress(
    () => !isPaidPreview() ? getPhotoMediaHash(props.photo, 'download') : undefined,
    () => !props.isDownloading,
    () => !isPaidPreview() ? getMediaFormat(props.photo, 'download') : undefined,
  ));
  const downloadProgress = () => mediaWithLoadProgressResult2().loadProgress;

  const getMediaTransferStateResult = createMemo(() => getMediaTransferState(
    props.uploadProgress || (props.isDownloading ? downloadProgress() : loadProgress()),
    shouldLoad() && !fullMediaData(),
    props.uploadProgress !== undefined,
  ));
  const isUploading = () => getMediaTransferStateResult().isUploading;
  const isTransferring = () => getMediaTransferStateResult().isTransferring;
  const transferProgress = () => getMediaTransferStateResult().transferProgress;
  const wasLoadDisabled = createMemo(() => previous(() => isLoadAllowed()) === false);

  const { ref: spinnerRef, shouldRender: shouldRenderSpinner } = createShowTransition({
    isOpen: () => isTransferring(),
    noMountTransition: wasLoadDisabled(),
    className: 'slow',
  });
  const { ref: downloadButtonRef, shouldRender: shouldRenderDownloadButton } = createShowTransition({
    isOpen: () => !fullMediaData() && !isLoadAllowed(),
  });
  const { ref: transferProgressRef, shouldRender: shouldRenderTransferProgress } = createShowTransition({
    isOpen: () => isTransferring(),
    noMountTransition: wasLoadDisabled(),
  });

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (isUploading()) {
      props.onCancelUpload?.(props.clickArg!);
      return;
    }

    if (isSpoilerShown() && props.noSpoilerReveal) {
      props.onClick?.(props.clickArg!, e);
      return;
    }

    if (!fullMediaData()) {
      setIsLoadAllowed((isAllowed) => !isAllowed);
      return;
    }

    if (isSpoilerShown()) {
      if (props.isMediaNsfw) {
        if (props.needsAgeVerification) {
          openAgeVerificationModal();
          return;
        }
        openNsfwModal();
        return;
      }
      hideSpoiler();
      return;
    }

    props.onClick?.(props.clickArg!, e);
  };

  createMutationEffect(
    depsOf(() => [props.shouldAffectAppendix, fullMediaData(), props.isOwn, props.isInSelectMode, props.isSelected, props.theme]), (_deps, prev) => {
      const [prevShouldAffectAppendix] = prev ?? [];
      if (!props.shouldAffectAppendix) {
        if (prevShouldAffectAppendix) {
          ref!.closest<HTMLDivElement>(MESSAGE_CONTENT_SELECTOR)!.removeAttribute(CUSTOM_APPENDIX_ATTRIBUTE);
        }
        return;
      }

      const contentEl = ref!.closest<HTMLDivElement>(MESSAGE_CONTENT_SELECTOR)!;
      if (fullMediaData()) {
        const messageId = Number(contentEl.closest<HTMLDivElement>('.Message')!.dataset.messageId);
        getCustomAppendixBg(fullMediaData(), Boolean(props.isOwn), messageId, props.isSelected, props.theme).then((appendixBg) => {
          requestMutation(() => {
            contentEl.style.setProperty('--appendix-bg', appendixBg);
            contentEl.setAttribute(CUSTOM_APPENDIX_ATTRIBUTE, '');
          });
        });
      } else {
        contentEl.classList.add('has-appendix-thumb');
      }
    },
  );

  const componentClassName = createMemo(() => buildClassName(
    'media-inner',
    styles.frame,
    styles[(props.layout === undefined ? 'intrinsic' : props.layout)],
    (props.size === undefined ? 'inline' : props.size) === 'pictogram' && styles.pictogram,
    !isUploading() && !props.nonInteractive && 'interactive',
    (width() === height() || (props.size === undefined ? 'inline' : props.size) === 'pictogram') && 'square-image',
    props.className,
  ));

  const style =
    createMemo(() => (props.size === undefined ? 'inline' : props.size) === 'inline' ? buildStyle(`--media-width: ${width()}px`, `--media-aspect-ratio: ${width() / height()}`) : undefined);

  return (
    <div id={props.id} ref={ref} class={componentClassName()} style={style()} onClick={isUploading() ? undefined : handleClick}>
      {withBlurredBackground() && <canvas ref={blurredBackgroundRef} class="thumbnail blurred-bg" />}
      {shouldRenderFullMedia() && (
        <img
          ref={fullMediaRef}
          src={fullMediaData() || prevMediaData()}
          class="full-media"
          alt=""
          draggable={!props.isProtected}
        />
      )}
      {withThumb() && <canvas ref={thumbRef} class="thumbnail" />}
      {props.isProtected && <span class="protector" />}
      {shouldRenderSpinner() && !shouldRenderDownloadButton() && (
        <div ref={spinnerRef} class={buildClassName('media-loading', styles.loading)}>
          <ProgressSpinner progress={transferProgress()} onClick={isUploading() ? handleClick : undefined} />
        </div>
      )}
      {shouldRenderDownloadButton() && (
        <Icon
          ref={downloadButtonRef}
          name="download"
          className={buildClassName(styles.controlButton, styles.downloadButton)}
        />
      )}
      <MediaSpoiler
        isVisible={isSpoilerShown()}
        withAnimation={props.noSpoilerReveal ? undefined : true}
        thumbDataUri={thumbDataUri()}
        width={width()}
        height={height()}
        className="media-spoiler"
        isNsfw={props.isMediaNsfw}
      />
      {shouldRenderTransferProgress() && (
        <MediaBadge ref={transferProgressRef} className="message-transfer-progress">
          {`${Math.round(transferProgress() * 100)}%`}
        </MediaBadge>
      )}
      <SensitiveContentConfirmModal
        isOpen={isNsfwModalOpen()}
        onClose={closeNsfwModal}
        shouldAlwaysShow={shouldAlwaysShowNsfw()}
        onAlwaysShowChanged={setShouldAlwaysShowNsfw}
        confirmHandler={handleNsfwConfirm}
      />
    </div>
  );
};

const mapStateToProps = (global: GlobalState): Complete<StateProps> => {
    const appConfig = global.appConfig;
    const needsAgeVerification = appConfig.needAgeVideoVerification;

    return {
      needsAgeVerification,
    };
  };

export default Photo;
