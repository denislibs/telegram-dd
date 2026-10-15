import { createEffect, createMemo, createSignal } from 'frameact';
import { Show } from 'frameact/dom';
import { getActions, withGlobal } from '../../../global';

import type { ApiMessage } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';
import { ApiMediaFormat } from '../../../api/types';

import { getMediaThumbUri, getStickerMediaHash } from '../../../global/helpers';
import { IS_WEBM_SUPPORTED } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import { depsOf } from '../../../util/effectDeps';
import { getStickerDimensions } from '../../common/helpers/mediaDimensions';

import useAppLayout from '../../../hooks/useAppLayout';
import useFlag from '../../../hooks/useFlag';
import { useIsIntersecting } from '../../../hooks/useIntersectionObserver';
import useMedia from '../../../hooks/useMedia';
import useOldLang from '../../../hooks/useOldLang';
import useOverlayPosition from './hooks/useOverlayPosition';

import AnimatedSticker from '../../common/AnimatedSticker';
import MediaSpoiler from '../../common/MediaSpoiler';
import SensitiveContentConfirmModal from '../../common/SensitiveContentConfirmModal';
import StickerView from '../../common/StickerView';
import Portal from '../../ui/Portal';

import styles from './Sticker.module.scss';

// https://github.com/telegramdesktop/tdesktop/blob/master/Telegram/SourceFiles/history/view/media/history_view_sticker.cpp#L42
const EFFECT_SIZE_MULTIPLIER = 1 + 0.245 * 2;

type OwnProps = {
  message: ApiMessage;
  shouldLoop?: boolean;
  shouldPlayEffect?: boolean;
  withEffect?: boolean;
  isMediaNsfw?: boolean;
  observeIntersection: ObserveFn;
  observeIntersectionForPlaying: ObserveFn;
  onStopEffect?: VoidFunction;
};

type StateProps = {
  needsAgeVerification?: boolean;
};

const Sticker = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  const { showNotification, openStickerSet, updateContentSettings, openAgeVerificationModal } = getActions();

  const lang = useOldLang();
  const { isMobile } = useAppLayout();

  let ref!: HTMLDivElement;

  let effectRef: HTMLDivElement | undefined;

  const sticker = createMemo(() => props.message.content.sticker!);
  const stickerSetInfo = () => sticker().stickerSetInfo;
  const isVideo = () => sticker().isVideo;
  const hasEffect = () => sticker().hasEffect;
  const isMirrored = createMemo(() => !props.message.isOutgoing);

  const [isNsfwModalOpen, openNsfwModal, closeNsfwModal] = useFlag();
  const [shouldAlwaysShowNsfw, setShouldAlwaysShowNsfw] = createSignal(false);

  const shouldShowSpoiler = createMemo(() => props.isMediaNsfw);
  const [isSpoilerShown, showSpoiler, hideSpoiler] = useFlag(shouldShowSpoiler());

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

  const mediaHash = createMemo(() =>
    getStickerMediaHash(sticker(), isVideo() && !IS_WEBM_SUPPORTED ? 'pictogram' : 'inline'),
  );

  const canLoad = useIsIntersecting(
    () => ref,
    () => props.observeIntersection,
  );
  const canPlay = useIsIntersecting(
    () => ref,
    () => props.observeIntersectionForPlaying,
  );
  const mediaHashEffect = createMemo(() => `sticker${sticker().id}?size=f`);
  const effectBlobUrl = useMedia(
    mediaHashEffect,
    () => !canLoad() || !hasEffect() || !props.withEffect,
    ApiMediaFormat.BlobUrl,
  );
  const [isPlayingEffect, startPlayingEffect, stopPlayingEffect] = useFlag();

  const thumbDataUri = createMemo(() => getMediaThumbUri(sticker()));

  const handleEffectEnded = () => {
    stopPlayingEffect();
    props.onStopEffect?.();
  };

  createEffect(
    depsOf(() => [hasEffect(), canPlay(), props.shouldPlayEffect, props.withEffect] as const),
    ([hasEffect2, canPlay2, shouldPlayEffect2, withEffect2]) => {
      if (hasEffect2 && withEffect2 && canPlay2 && shouldPlayEffect2) {
        startPlayingEffect();
      }
    },
  );

  const shouldRenderEffect = createMemo(() => hasEffect() && props.withEffect && effectBlobUrl() && isPlayingEffect());
  useOverlayPosition({
    anchorRef: () => ref,
    overlayRef: () => effectRef,
    isMirrored: () => isMirrored(),
    isDisabled: () => !shouldRenderEffect(),
  });

  const openModal = () => {
    openStickerSet({
      stickerSetInfo: sticker().stickerSetInfo,
    });
  };

  const handleClick = () => {
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

    if (hasEffect()) {
      if (isPlayingEffect() || !props.withEffect) {
        showNotification({
          message: lang('PremiumStickerTooltip'),
          action: {
            action: 'openStickerSet',
            payload: {
              stickerSetInfo: sticker().stickerSetInfo,
            },
          },
          actionText: lang('ViewAction'),
        });
        return;
      } else if (props.withEffect) {
        startPlayingEffect();
        return;
      }
    }
    openModal();
  };

  const isMemojiSticker = createMemo(() => 'isMissing' in stickerSetInfo());
  const getStickerDimensionsResult = createMemo(() => getStickerDimensions(sticker(), isMobile()));
  const width = () => getStickerDimensionsResult().width;
  const height = () => getStickerDimensionsResult().height;
  const className = createMemo(() =>
    buildClassName(
      'media-inner',
      styles.root,
      isMemojiSticker() && styles.inactive,
      hasEffect() && isMirrored() && styles.mirrored,
    ),
  );

  return (
    <div
      ref={ref}
      class={className()}
      style={`width: ${width()}px; height: ${height()}px;`}
      // Deviation: a handler is bound once, so the memoji check is made when the click happens
      onClick={() => {
        if (!isMemojiSticker()) handleClick();
      }}
    >
      <StickerView
        containerRef={() => ref}
        sticker={sticker()}
        fullMediaHash={mediaHash()}
        fullMediaClassName="full-media"
        size={width()}
        shouldLoop={props.shouldLoop}
        noLoad={!canLoad()}
        noPlay={!canPlay()}
        withSharedAnimation
      />
      <MediaSpoiler
        isVisible={isSpoilerShown()}
        withAnimation
        thumbDataUri={thumbDataUri()}
        width={width()}
        height={height()}
        className="media-spoiler"
        isNsfw={props.isMediaNsfw}
      />
      {shouldRenderEffect() && (
        <Portal>
          {/* Deviation: tt's `key={mediaHashEffect}` -> a keyed Show */}
          <Show when={mediaHashEffect()} keyed>
            {(_key) => (
              <AnimatedSticker
                ref={(el) => {
                  effectRef = el;
                }}
                className={buildClassName(styles.effect, isMirrored() && styles.mirrored)}
                tgsUrl={effectBlobUrl()}
                size={width() * EFFECT_SIZE_MULTIPLIER}
                play
                isLowPriority
                noLoop
                onEnded={handleEffectEnded}
              />
            )}
          </Show>
        </Portal>
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

export default Sticker;
