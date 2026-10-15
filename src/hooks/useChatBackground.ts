import { createMemo, untrack } from 'frameact';

import type { IThemeSettings, ThemeKey } from '../types';
import type { WallpaperStorageSource } from '../util/wallpaperStorage';

import { type MaybeAccessor, read } from '../util/accessors';
import buildClassName from '../util/buildClassName';
import buildStyle from '../util/buildStyle';
import { buildWallpaperRenderModel } from '../util/wallpaper';
import useCustomBackground from './useCustomBackground';
import useGradientBackground from './useGradientBackground';

import backgroundStyles from '../styles/_patternBackground.module.scss';

type ChatBackgroundParams = {
  theme: MaybeAccessor<ThemeKey>;
  wallpaper: MaybeAccessor<IThemeSettings>;
  // Previews don't animate: draw the same gradient once on a 2D canvas instead of a live WebGL renderer.
  isStatic?: MaybeAccessor<boolean | undefined>;
  source?: MaybeAccessor<WallpaperStorageSource | undefined>;
};

// Shared chat-background rendering: resolves the active wallpaper (custom image, color, gradient or
// pattern — falling back to the built-in default) into the class names, CSS variables and gradient
// canvas that `Main` and the preview modals all render identically.
// Deviation: the params are accessors and the results are accessors (frameact components run once).
export default function useChatBackground(params: ChatBackgroundParams) {
  const selectedModel = createMemo(() => buildWallpaperRenderModel(read(params.theme), read(params.wallpaper)));
  const customBackgroundValue = useCustomBackground(
    () => read(params.theme),
    () => selectedModel().customBackground,
    () => selectedModel().isPattern,
    () => read(params.source),
  );
  const model = createMemo(() =>
    read(params.source) === 'lockScreen' && selectedModel().customBackground && !customBackgroundValue()
      ? buildWallpaperRenderModel(read(params.theme), {})
      : selectedModel(),
  );
  const hasGradient = createMemo(() => !model().isImage && model().colors.length >= 2);
  let wasMaskedPatternRef = untrack(() => model().isMaskedPattern);
  const shouldSnapGradient = createMemo(() => {
    const shouldSnap = model().isMaskedPattern && !wasMaskedPatternRef;
    wasMaskedPatternRef = model().isMaskedPattern;
    return shouldSnap;
  });

  // Entering masked mode snaps away bright transition frames; masked wallpapers still morph between each other
  const gradientCanvasRef = useGradientBackground(
    () => (hasGradient() ? model().colors : undefined),
    shouldSnapGradient,
    () => read(params.isStatic),
    () => model().backgroundRotation,
  );

  // A custom pattern renders once its mask blob or the previous pattern mask is ready. The built-in
  // default uses `pattern.svg` and is always ready.
  const isPatternVisible = createMemo(
    () => model().isPattern && (model().isDefault || Boolean(customBackgroundValue())),
  );
  // The canvas is marked ready as soon as the gradient draws, but a masked pattern's mask only
  // applies once its blob loads. Keep the canvas hidden until then, so its full unmasked gradient
  // doesn't flash over the whole background in the gap.
  const isMaskedPatternPending = createMemo(() => model().isMaskedPattern && !isPatternVisible());

  const backgroundClassNames = createMemo(() =>
    buildClassName(
      backgroundStyles.background,
      model().isImage && backgroundStyles.customBgImage,
      (model().baseColor || hasGradient()) && backgroundStyles.customBgColor,
      isPatternVisible() && !model().isMaskedPattern && backgroundStyles.withPattern,
      isPatternVisible() && model().isMaskedPattern && backgroundStyles.withMaskedPattern,
      isMaskedPatternPending() && backgroundStyles.maskedPatternPending,
      model().isImage && model().isBlurred && backgroundStyles.blurred,
    ),
  );

  // Set on the shared ancestor of the background and the content: `--pattern-color` is also read by
  // message bubbles, the rest by the background layer itself.
  const rootStyle = createMemo(() =>
    buildStyle(
      model().patternColor && `--pattern-color: ${model().patternColor}`,
      model().baseColor && `--theme-background-color: ${model().baseColor}`,
      model().isPattern && customBackgroundValue() && `--custom-pattern: ${customBackgroundValue()}`,
      model().isPattern &&
        model().patternIntensity !== undefined &&
        `--pattern-intensity: ${Math.abs(model().patternIntensity!) / 100}`,
    ),
  );

  const backgroundStyle = createMemo(() =>
    model().isImage && customBackgroundValue() ? `--custom-background: ${customBackgroundValue()}` : undefined,
  );

  return {
    backgroundClassNames,
    rootStyle,
    backgroundStyle,
    gradientCanvasRef,
    hasGradient,
  };
}
