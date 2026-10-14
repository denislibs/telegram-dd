import { createEffect, createSignal } from 'frameact';
import { getActions } from '../global';
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

// TODO(codemod): useCustomBackground: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useCustomBackground(
  theme: ThemeKey,
  settingValue?: string,
  shouldKeepPrevious?: boolean,
  source?: WallpaperStorageSource,
) {
  const { setThemeSettings } = getActions();
  // An already-prefetched URL is available on the first render
  const [resolved, setResolved] = createSignal<ResolvedBackground | undefined>(
    (() => {
      if (!settingValue || settingValue.startsWith('#')) return undefined;

      const prefetchedUrl = getResolvedWallpaperUrl(settingValue, source);
      return prefetchedUrl
        ? {
            slug: settingValue,
            source,
            value: `url(${prefetchedUrl})`,
            canKeepAsFallback: Boolean(shouldKeepPrevious),
          }
        : undefined;
    })(),
  );

  createEffect(
    depsOf(() => [settingValue, shouldKeepPrevious, source, theme]),
    () => {
      // Colors are usable synchronously (handled below); only slugs need their cached blob loaded.
      if (!settingValue || settingValue.startsWith('#')) {
        setResolved(undefined);
        return undefined;
      }

      let isCancelled = false;

      const urlHandle = acquireWallpaperUrl(settingValue, source);
      urlHandle.promise
        .then((url) => {
          if (isCancelled) return;
          const value = `url(${url})`;
          setResolved((prev) =>
            prev?.slug === settingValue && prev.source === source && prev.value === value
              ? prev
              : {
                  slug: settingValue,
                  source,
                  value,
                  canKeepAsFallback: Boolean(shouldKeepPrevious),
                },
          );
        })
        .catch(() => {
          if (isCancelled) return;
          if (source === 'lockScreen') {
            setResolved(undefined);
            return;
          }
          // The cached blob is gone (e.g. evicted) — fully reset to the default wallpaper
          setThemeSettings({
            theme,
            ...RESET_WALLPAPER_SETTINGS,
            isBlurred: true,
            patternColor: getDefaultPatternColor(theme),
          });
        });

      return () => {
        isCancelled = true;
        urlHandle.release();
        // Pattern masks remain visible while the next mask resolves
        if (!shouldKeepPrevious) {
          setResolved((prev) => (prev?.slug === settingValue ? undefined : prev));
        }
      };
    },
  );

  if (!settingValue) return undefined;
  if (settingValue.startsWith('#')) return settingValue;
  // TODO(codemod): this statement reads reactive values but runs once (teact re-ran it every render): move it into an effect or a memo
  if (resolved()?.slug === settingValue && resolved().source === source) return resolved.value;
  return shouldKeepPrevious && resolved() && resolved().source === source && resolved().canKeepAsFallback
    ? resolved().value
    : undefined;
}
