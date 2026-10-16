import { createEffect, createMemo, createSignal, frameMutation, onDestroy, previous, requestMutation } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';

import type { ApiMediaExtendedPreview, ApiPhoto } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import type { ThemeKey } from '../../../types';

import { CUSTOM_APPENDIX_ATTRIBUTE, MESSAGE_CONTENT_SELECTOR } from '../../../config';
import { createMediaTransition, createShowTransition } from '../../../lib/kit';
import {
  getMediaDimensions,
  getMediaFormat,
  getMediaThumbUri,
  getMediaTransferState,
  getPhotoMediaHash,
} from '../../../global/helpers';
import { areRecordsShallowEqual } from '../../../util/areShallowEqual';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';
import { depsOf } from '../../../util/effectDeps';
import { clampMediaDimensions, clampNumber } from '../../common/helpers/placeholder';
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
  const props = withGlobal(
    mergeProps({ size: 'inline', layout: 'intrinsic' }, ownProps) as OwnProps<T> &
      Required<Pick<OwnProps<T>, 'size' | 'layout'>>,
    mapStateToProps,
  );
  let ref!: HTMLDivElement;
  // `props.photo` is replaced when the views or the reactions of the message change: nothing is derived from its identity.
  const photo = () => (props.photo.mediaType === 'photo' ? props.photo : undefined);
  const isPaidPreview = () => props.photo.mediaType === 'extendedMediaPreview';
  // Deviation (untrusted): the dimensions come from the server; `clampMediaDimensions` keeps them finite and bounded
  // (a legitimate size is unchanged). The memo is compared shallowly, so a replaced `photo` of the same size wakes nobody.
  const dimensions = createMemo(() => clampMediaDimensions(getMediaDimensions(props.photo)), {
    equals: areRecordsShallowEqual,
  });
  const width = () => dimensions().width;
  const height = () => dimensions().height;

  const localBlobUrl = () => photo()?.blobUrl;

  const isIntersecting = useIsIntersecting(
    () => ref,
    () => props.observeIntersection,
  );

  // Deviation: `useState(canAutoLoad)` is an initial value, so `canAutoLoad` is read once, at creation, on purpose.
  const [isLoadAllowed, setIsLoadAllowed] = createSignal(props.canAutoLoad);
  const shouldLoad = createMemo(() => Boolean(isLoadAllowed()) && isIntersecting() && !isPaidPreview());
  const { mediaData, loadProgress } = useMediaWithLoadProgress(
    () => {
      const photo2 = photo();
      return photo2 ? getPhotoMediaHash(photo2, props.size) : undefined;
    },
    () => !shouldLoad(),
  );
  const prevMediaData = previous(mediaData);
  const fullMediaData = createMemo(() => localBlobUrl() || mediaData());

  // Deviation: `useMediaTransition({ withShouldRender })` -> `createMediaTransition`: `shouldRender` gates the `<img>`
  // and `fullMediaRef` is handed to it.
  const { ref: fullMediaRef, shouldRender: shouldRenderFullMedia } = createMediaTransition({
    hasMediaData: () => Boolean(fullMediaData()),
  });

  const withBlurredBackground = () => props.layout !== 'fill' && props.size === 'inline';
  // Deviation: `useState(!fullMediaData)` is an initial value: whether the thumb canvas exists is decided once, at creation.
  const withThumb = !fullMediaData();
  const noThumb = () => Boolean(fullMediaData());
  const thumbRef = useBlurredMediaThumbRef(
    () => props.photo,
    () => noThumb(),
  );
  // Deviation: tt passed the canvas ref object to `useMediaTransition({ ref })`; here the transition's `ref` is applied to
  // the canvas next to the blur hook's ref.
  const { ref: thumbTransitionRef } = createMediaTransition({ hasMediaData: () => !noThumb() });
  const blurredBackgroundRef = useBlurredMediaThumbRef(
    () => props.photo,
    () => !withBlurredBackground(),
  );

  const { updateContentSettings, openAgeVerificationModal } = getActions();
  const [isNsfwModalOpen, openNsfwModal, closeNsfwModal] = useFlag();
  const [shouldAlwaysShowNsfw, setShouldAlwaysShowNsfw] = createSignal(false);

  const shouldShowSpoiler = createMemo(() => Boolean(isPaidPreview() || photo()?.isSpoiler || props.isMediaNsfw));
  // Deviation: `useFlag(shouldShowSpoiler)` is an initial value, read once at creation.
  const [isSpoilerShown, showSpoiler, hideSpoiler] = useFlag(shouldShowSpoiler());

  // Runs when `shouldShowSpoiler` CHANGES, not when the message is updated: a revealed spoiler stays revealed.
  createEffect(
    () => shouldShowSpoiler(),
    (shouldShowSpoiler2) => {
      if (shouldShowSpoiler2) {
        showSpoiler();
      } else {
        hideSpoiler();
      }
    },
  );

  const handleNsfwConfirm = () => {
    closeNsfwModal();
    hideSpoiler();

    if (shouldAlwaysShowNsfw()) {
      updateContentSettings({ isSensitiveEnabled: true });
    }
  };

  const { loadProgress: downloadProgress } = useMediaWithLoadProgress(
    () => {
      const photo2 = photo();
      return photo2 ? getPhotoMediaHash(photo2, 'download') : undefined;
    },
    () => !props.isDownloading,
    () => {
      const photo2 = photo();
      return photo2 ? getMediaFormat(photo2, 'download') : undefined;
    },
  );

  const transferState = createMemo(
    () =>
      getMediaTransferState(
        props.uploadProgress || (props.isDownloading ? downloadProgress() : loadProgress()),
        shouldLoad() && !fullMediaData(),
        props.uploadProgress !== undefined,
      ),
    { equals: areRecordsShallowEqual },
  );
  const isUploading = () => transferState().isUploading;
  const isTransferring = () => transferState().isTransferring;
  // Deviation (untrusted): the progress is a number of the API; it is bounded to [0, 1] before it reaches the spinner and
  // the percentage.
  const transferProgress = () => clampNumber(transferState().transferProgress, 0, 1, 0);
  // Deviation: tt's `usePreviousDeprecated(isLoadAllowed) === false` was read only at mount (`noMountTransition`), where the
  // previous value is always `undefined`: it is always `false`, so the option is not set.

  const { ref: spinnerRef, shouldRender: shouldRenderSpinner } = createShowTransition({
    isOpen: () => isTransferring(),
    className: 'slow',
  });
  const { ref: downloadButtonRef, shouldRender: shouldRenderDownloadButton } = createShowTransition({
    isOpen: () => !fullMediaData() && !isLoadAllowed(),
  });
  const { ref: transferProgressRef, shouldRender: shouldRenderTransferProgress } = createShowTransition({
    isOpen: () => isTransferring(),
  });

  // Deviation: the spoiler overlay is created once a spoiler has been shown and then stays, so its hide animation plays;
  // a photo that never has a spoiler creates no `MediaSpoiler` (its canvas, its transition and its effects).
  let hadSpoiler = false;
  const shouldRenderSpoiler = createMemo(() => {
    hadSpoiler = hadSpoiler || isSpoilerShown();
    return hadSpoiler;
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

  // Deviation: a token of the latest run; the background of an older run (the deps changed while the worker computed it)
  // is dropped, and so is the one of a destroyed photo.
  let appendixRun = 0;
  onDestroy(() => {
    appendixRun++;
  });
  // Deviation: `useLayoutEffectWithPrevDeps` -> an effect on the mutate phase. It writes the DOM of the message and reads
  // `ref`, so its first apply is booked after the element exists (`createMutationEffect` applies at creation).
  createEffect(
    depsOf(
      () =>
        [
          props.shouldAffectAppendix,
          fullMediaData(),
          props.isOwn,
          props.isInSelectMode,
          props.isSelected,
          props.theme,
        ] as const,
    ),
    ([shouldAffectAppendix, fullMediaData2, isOwn, , isSelected, theme], prevDeps) => {
      const run = ++appendixRun;
      const [prevShouldAffectAppendix] = prevDeps ?? [];
      if (!shouldAffectAppendix) {
        if (prevShouldAffectAppendix) {
          ref.closest<HTMLDivElement>(MESSAGE_CONTENT_SELECTOR)!.removeAttribute(CUSTOM_APPENDIX_ATTRIBUTE);
        }
        return;
      }

      const contentEl = ref.closest<HTMLDivElement>(MESSAGE_CONTENT_SELECTOR)!;
      if (fullMediaData2) {
        const messageId = Number(contentEl.closest<HTMLDivElement>('.Message')!.dataset.messageId);
        getCustomAppendixBg(fullMediaData2, Boolean(isOwn), messageId, isSelected, theme)
          .then((appendixBg) => {
            if (run !== appendixRun) return;

            requestMutation(() => {
              contentEl.style.setProperty('--appendix-bg', appendixBg);
              contentEl.setAttribute(CUSTOM_APPENDIX_ATTRIBUTE, '');
            });
          })
          // Deviation (untrusted): the worker rejects for an undecodable image; tt left an unhandled rejection.
          .catch(() => undefined);
      } else {
        contentEl.classList.add('has-appendix-thumb');
      }
    },
    frameMutation,
  );

  const componentClassName = () =>
    buildClassName(
      'media-inner',
      styles.frame,
      styles[props.layout],
      props.size === 'pictogram' && styles.pictogram,
      !isUploading() && !props.nonInteractive && 'interactive',
      (width() === height() || props.size === 'pictogram') && 'square-image',
      props.className,
    );

  const style = () =>
    props.size === 'inline'
      ? buildStyle(`--media-width: ${width()}px`, `--media-aspect-ratio: ${dimensions().aspectRatio}`)
      : undefined;

  // Deviation: `usePrevious(mediaData)` -> `previous`, which only sees the changes it is asked for: it is read first,
  // whatever `fullMediaData()` is.
  const imageSrc = () => {
    const prevMediaData2 = prevMediaData();
    return fullMediaData() || prevMediaData2;
  };

  return (
    <div
      id={props.id}
      ref={ref}
      class={componentClassName()}
      style={style()}
      // Deviation: a handler is bound once, so `isUploading` is checked at the click.
      onClick={(e) => {
        if (!isUploading()) handleClick(e);
      }}
    >
      {withBlurredBackground() && <canvas ref={blurredBackgroundRef} class="thumbnail blurred-bg" />}
      {shouldRenderFullMedia() && (
        // Deviation: `decoding="async"` keeps the decode of the full photo off the main thread.
        <img
          ref={fullMediaRef}
          src={imageSrc()}
          class="full-media"
          alt=""
          decoding="async"
          draggable={props.isProtected ? 'false' : 'true'}
        />
      )}
      {withThumb && (
        <canvas
          ref={(el) => {
            thumbRef(el);
            thumbTransitionRef(el);
          }}
          class="thumbnail"
        />
      )}
      {props.isProtected && <span class="protector" />}
      {shouldRenderSpinner() && !shouldRenderDownloadButton() && (
        <div ref={spinnerRef} class={buildClassName('media-loading', styles.loading)}>
          <ProgressSpinner
            progress={transferProgress()}
            onClick={(e) => {
              if (isUploading()) handleClick(e);
            }}
          />
        </div>
      )}
      {shouldRenderDownloadButton() && (
        <Icon
          ref={downloadButtonRef}
          name="download"
          className={buildClassName(styles.controlButton, styles.downloadButton)}
        />
      )}
      {shouldRenderSpoiler() && (
        <MediaSpoiler
          isVisible={isSpoilerShown()}
          withAnimation={props.noSpoilerReveal ? undefined : true}
          thumbDataUri={getMediaThumbUri(props.photo)}
          width={width()}
          height={height()}
          className="media-spoiler"
          isNsfw={props.isMediaNsfw}
        />
      )}
      {shouldRenderTransferProgress() && (
        <MediaBadge ref={transferProgressRef} className="message-transfer-progress">
          {`${Math.round(transferProgress() * 100)}%`}
        </MediaBadge>
      )}
      {/* Deviation: the modal exists only for a sensitive photo (perf: a dialog and a state mapper per photo otherwise). */}
      {props.isMediaNsfw && (
        <SensitiveContentConfirmModal
          isOpen={isNsfwModalOpen()}
          onClose={closeNsfwModal}
          shouldAlwaysShow={shouldAlwaysShowNsfw()}
          onAlwaysShowChanged={setShouldAlwaysShowNsfw}
          confirmHandler={handleNsfwConfirm}
        />
      )}
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
