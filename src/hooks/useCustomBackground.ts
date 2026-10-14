import { createEffect, createMemo, createSignal, untrack } from 'frameact';
import { getActions } from '../global';
import { type MaybeAccessor, read } from '../util/accessors';
import { depsOf } from '../util/effectDeps';

import type { ThemeKey } from '../types';
import type { WallpaperStorageSource } from '../util/wallpaperStorage';

import { getDefaultPatternColor, RESET_WALLPAPER_SETTINGS } from '../util/wallpaper';
import { acquireWallpaperUrl, getResolvedWallpaperUrl } from '../util/wallpaperStorage';

type ResolvedBackground = {
  slug: string;
  source?: WallpaperStorageSource;
  value: string;
  canKeepAsFallback: boolean;
};

// Deviation: the params are accessors and the result is an accessor (frameact components run once).
export default function useCustomBackground(
  theme: MaybeAccessor<ThemeKey>,
  settingValue?: MaybeAccessor<string | undefined>,
  shouldKeepPrevious?: MaybeAccessor<boolean | undefined>,
  source?: MaybeAccessor<WallpaperStorageSource | undefined>,
) {
  const { setThemeSettings } = getActions();
  // An already-prefetched URL is available on the first render
  const [resolved, setResolved] = createSignal<ResolvedBackground | undefined>(
    untrack(() => {
      const initialValue = read(settingValue);
      const initialSource = read(source);
      if (!initialValue || initialValue.startsWith('#')) return undefined;

      const prefetchedUrl = getResolvedWallpaperUrl(initialValue, initialSource);
      return prefetchedUrl
        ? {
            slug: initialValue,
            source: initialSource,
            value: `url(${prefetchedUrl})`,
            canKeepAsFallback: Boolean(read(shouldKeepPrevious)),
          }
        : undefined;
    }),
  );

  createEffect(
    depsOf(() => [read(settingValue), read(shouldKeepPrevious), read(source), read(theme)] as const),
    ([settingValue2, shouldKeepPrevious2, source2, theme2]) => {
      // Colors are usable synchronously (handled below); only slugs need their cached blob loaded.
      if (!settingValue2 || settingValue2.startsWith('#')) {
        setResolved(undefined);
        return undefined;
      }

      let isCancelled = false;

      const urlHandle = acquireWallpaperUrl(settingValue2, source2);
      urlHandle.promise
        .then((url) => {
          if (isCancelled) return;
          const value = `url(${url})`;
          setResolved((prev) =>
            prev?.slug === settingValue2 && prev.source === source2 && prev.value === value
              ? prev
              : {
                  slug: settingValue2,
                  source: source2,
                  value,
                  canKeepAsFallback: Boolean(shouldKeepPrevious2),
                },
          );
        })
        .catch(() => {
          if (isCancelled) return;
          if (source2 === 'lockScreen') {
            setResolved(undefined);
            return;
          }
          // The cached blob is gone (e.g. evicted) — fully reset to the default wallpaper
          setThemeSettings({
            theme: theme2,
            ...RESET_WALLPAPER_SETTINGS,
            isBlurred: true,
            patternColor: getDefaultPatternColor(theme2),
          });
        });

      return () => {
        isCancelled = true;
        urlHandle.release();
        // Pattern masks remain visible while the next mask resolves
        if (!shouldKeepPrevious2) {
          setResolved((prev) => (prev?.slug === settingValue2 ? undefined : prev));
        }
      };
    },
  );

  return createMemo(() => {
    const settingValue2 = read(settingValue);
    const source2 = read(source);
    const shouldKeepPrevious2 = read(shouldKeepPrevious);
    if (!settingValue2) return undefined;
    if (settingValue2.startsWith('#')) return settingValue2;
    const current = resolved();
    if (current?.slug === settingValue2 && current.source === source2) return current.value;
    return shouldKeepPrevious2 && current && current.source === source2 && current.canKeepAsFallback
      ? current.value
      : undefined;
  });
}
