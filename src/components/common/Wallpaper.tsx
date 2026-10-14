import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { withGlobal } from '../../global';
import type { GlobalState } from '../../global/types';

import type { IThemeSettings, ThemeKey } from '../../types';

import { selectPerformanceSettingsValue, selectTheme, selectThemeValues } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';

import useChatBackground from '../../hooks/useChatBackground';

import backgroundStyles from '../../styles/_patternBackground.module.scss';

type OwnProps = {
  children?: JSX.Element;
  containerRef?: (el: HTMLDivElement) => void;
  id?: string;
  className?: string;
  // Extra classes for the background layer itself (e.g. the chat's right-column transitions).
  bgClassName?: string;
  style?: string;
  // Disables interaction with the wrapped content (used for non-interactive message previews).
  inert?: boolean;
  // Previews don't animate: draw the same gradient once on a 2D canvas instead of a live WebGL renderer.
  isStatic?: boolean;
  backgroundMode?: 'default' | 'lockScreen';
  onClick?: NoneToVoidFunction;
};

type StateProps = {
  theme: ThemeKey;
  canAnimateGradient?: boolean;
  themeSettings?: IThemeSettings;
};

const EMPTY_THEME_SETTINGS: IThemeSettings = {};

// Wraps the chat content and renders the wallpaper behind it: the animated gradient + doodle pattern
// (or a custom image / solid color), plus the CSS variables message bubbles read. Pulls the active
// active theme's wallpaper from global.
const Wallpaper = (ownProps: OwnProps) => {
  const props = withGlobal(ownProps, mapStateToProps);
  // With the send animation disabled the gradient never moves, so the 2D render is identical
  // and no WebGL context is spent
  const isStaticGradient = createMemo(() => props.isStatic || !props.canAnimateGradient);

  const background = useChatBackground({
    theme: () => props.theme,
    wallpaper: () => props.themeSettings || EMPTY_THEME_SETTINGS,
    isStatic: () => isStaticGradient(),
    source: () => (props.backgroundMode === 'lockScreen' ? 'lockScreen' : undefined),
  });

  return (
    <div
      ref={props.containerRef}
      id={props.id}
      class={props.className}
      style={buildStyle(background.rootStyle(), props.style) || undefined}
      inert={props.inert}
      onClick={() => props.onClick?.()}
    >
      <div
        class={buildClassName(background.backgroundClassNames(), props.bgClassName)}
        style={background.backgroundStyle()}
      >
        <Show when={background.hasGradient()}>
          {/* A canvas can hold only one context type, so switching between the animated (WebGL)
              and static (2D) renderers must recreate the element (tt: `key`) */}
          <Show when={isStaticGradient() ? 'static' : 'animated'} keyed>
            {() => <canvas ref={background.gradientCanvasRef} class={backgroundStyles.gradientCanvas} />}
          </Show>
        </Show>
      </div>
      {props.children}
    </div>
  );
};

// No `memo`: `children` change on nearly every parent render, so memoization would never apply
const mapStateToProps = (global: GlobalState, { backgroundMode }: OwnProps): Complete<StateProps> => {
  const theme = selectTheme(global);

  return {
    theme,
    canAnimateGradient: selectPerformanceSettingsValue(global, 'messageSendingAnimations'),
    themeSettings: backgroundMode === 'default' ? EMPTY_THEME_SETTINGS : selectThemeValues(global, theme),
  };
};

export default Wallpaper;
