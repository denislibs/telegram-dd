import { createMemo, createMutationEffect, createSignal } from 'frameact';
import { Show } from 'frameact/dom';
import { withGlobal } from '../../global';

import type { ApiTypeStory } from '../../api/types';
import type { GlobalState } from '../../global/types';
import type { ThemeKey } from '../../types';

import { selectPeerStories, selectTheme } from '../../global/selectors';
import buildClassName from '../../util/buildClassName';
import buildStyle from '../../util/buildStyle';
import { depsOf } from '../../util/effectDeps';
import { REM } from './helpers/mediaDimensions';

import useDevicePixelRatio from '../../hooks/window/useDevicePixelRatio';

interface OwnProps {
  peerId: string;
  className?: string;
  size: number;
  withExtraGap?: boolean;
  extraGapPercent?: number;
  colors?: string[];
  style?: string;
}

interface StateProps {
  peerStories?: Record<number, ApiTypeStory>;
  storyIds?: number[];
  lastReadId?: number;
  appTheme: ThemeKey;
}

const BLUE = ['#34C578', '#3CA3F3'];
const GREEN = ['#C9EB38', '#09C167'];
const GRAY = '#C4C9CC';
const DARK_GRAY = '#737373';
const STROKE_WIDTH = 0.125 * REM;
const STROKE_WIDTH_LARGE = 0.25 * REM;
const GAP_PERCENT = 2;
const SEGMENTS_MAX = 45; // More than this breaks rendering in Safari and Chrome
const LARGE_SIZE = 4 * REM;

const GAP_PERCENT_EXTRA = 10;
const EXTRA_GAP_ANGLE = Math.PI / 4;

function AvatarStoryCircle(ownProps: OwnProps) {
  const props = withGlobal(ownProps, mapStateToProps);
  // Deviation: the canvas is a signal, because it is created by the `<Show>` below, after the effect, and the effect must redraw once it exists.
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement | undefined>(undefined);

  const dpr = useDevicePixelRatio();

  const isLarge = createMemo(() => props.size > LARGE_SIZE);
  const strokeWidth = createMemo(() => (isLarge() ? STROKE_WIDTH_LARGE : STROKE_WIDTH));
  const adaptedSize = createMemo(() => props.size + strokeWidth() + (isLarge() ? 0.25 * REM : 0)); // Add extra gap space for large avatars

  const values = createMemo(() => {
    return (props.storyIds || []).reduce(
      (acc, id) => {
        acc.total += 1;
        if (props.lastReadId && id <= props.lastReadId) {
          acc.read += 1;
        }

        return acc;
      },
      { total: 0, read: 0 },
    );
  });

  const isCloseFriend = createMemo(() => {
    const peerStories = props.peerStories;
    if (!peerStories || !props.storyIds?.length) {
      return false;
    }

    return props.storyIds.some((id) => {
      const story = peerStories[id];
      if (!story || !('isForCloseFriends' in story)) {
        return false;
      }
      const isRead = props.lastReadId && story.id <= props.lastReadId;
      return story.isForCloseFriends && !isRead;
    });
  });

  createMutationEffect(
    depsOf(
      () =>
        [
          canvas(),
          props.appTheme,
          isCloseFriend(),
          adaptedSize(),
          values().read,
          values().total,
          props.withExtraGap,
          props.extraGapPercent,
          dpr(),
          props.colors,
          props.size,
          strokeWidth(),
        ] as const,
    ),
    ([, appTheme2, , , , , withExtraGap2, extraGapPercent2, , colors2]) => {
      const canvasEl = canvas();
      if (!canvasEl) {
        return;
      }

      drawGradientCircle({
        canvas: canvasEl,
        size: adaptedSize(),
        strokeWidth: strokeWidth(),
        segmentsCount: values().total,
        colorStops: colors2 || (isCloseFriend() ? GREEN : BLUE),
        readSegmentsCount: values().read,
        withExtraGap: withExtraGap2,
        extraGapPercent: extraGapPercent2,
        readSegmentColor: appTheme2 === 'dark' ? DARK_GRAY : GRAY,
        dpr: dpr(),
      });
    },
  );

  return (
    <Show when={values().total}>
      <canvas
        ref={(el) => setCanvas(el)}
        class={buildClassName('story-circle', props.className)}
        style={buildStyle(`max-width: ${adaptedSize()}px`, `max-height: ${adaptedSize()}px`, props.style)}
      />
    </Show>
  );
}

const mapStateToProps = (global: GlobalState, { peerId }: OwnProps): Complete<StateProps> => {
  const peerStories = selectPeerStories(global, peerId);
  const appTheme = selectTheme(global);

  return {
    peerStories: peerStories?.byId,
    storyIds: peerStories?.orderedIds,
    lastReadId: peerStories?.lastReadId,
    appTheme,
  };
};

export default AvatarStoryCircle;

export function drawGradientCircle({
  canvas,
  size,
  strokeWidth: strokeWidthPx = STROKE_WIDTH,
  colorStops,
  segmentsCount,
  readSegmentsCount = 0,
  withExtraGap = false,
  extraGapPercent = GAP_PERCENT_EXTRA,
  readSegmentColor,
  dpr,
}: {
  canvas: HTMLCanvasElement;
  strokeWidth?: number;
  size: number;
  colorStops: string[];
  segmentsCount: number;
  readSegmentsCount?: number;
  withExtraGap?: boolean;
  extraGapPercent?: number;
  readSegmentColor: string;
  dpr: number;
}) {
  if (segmentsCount > SEGMENTS_MAX) {
    readSegmentsCount = Math.round(readSegmentsCount * (SEGMENTS_MAX / segmentsCount));

    segmentsCount = SEGMENTS_MAX;
  }

  const sizeModifier = dpr;
  const strokeModifier = dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const canvasSize = size * sizeModifier;
  const strokeWidth = strokeWidthPx * strokeModifier;

  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const centerCoordinate = canvasSize / 2;
  const radius = (canvasSize - strokeWidth) / 2;
  const segmentAngle = (2 * Math.PI) / segmentsCount;
  const gapSize = (GAP_PERCENT / 100) * (2 * Math.PI);
  const gradient = ctx.createLinearGradient(
    0,
    0,
    Math.ceil(canvasSize * Math.cos(Math.PI / 2)),
    Math.ceil(canvasSize * Math.sin(Math.PI / 2)),
  );

  if (colorStops.length === 1) {
    gradient.addColorStop(0, colorStops[0]);
    gradient.addColorStop(1, colorStops[0]);
  } else {
    colorStops.forEach((colorStop, index) => {
      gradient.addColorStop(index / (colorStops.length - 1), colorStop);
    });
  }

  ctx.lineCap = 'round';
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  const extraGapSize = (extraGapPercent / 100) * (2 * Math.PI);
  const extraGapStart = EXTRA_GAP_ANGLE - extraGapSize / 2;
  const extraGapEnd = EXTRA_GAP_ANGLE + extraGapSize / 2;

  Array.from({ length: segmentsCount }).forEach((_, i) => {
    const isRead = i < readSegmentsCount;
    let startAngle = i * segmentAngle - Math.PI / 2 + gapSize / 2;
    let endAngle = startAngle + segmentAngle - (segmentsCount > 1 ? gapSize : 0);

    ctx.strokeStyle = isRead ? readSegmentColor : gradient;
    ctx.lineWidth = strokeWidth * (isRead ? 0.5 : 1);

    if (withExtraGap) {
      if (startAngle >= extraGapStart && endAngle <= extraGapEnd) {
        // Segment is inside extra gap
        return;
      } else if (startAngle < extraGapStart && endAngle > extraGapEnd) {
        // Extra gap is inside segment
        ctx.beginPath();
        ctx.arc(centerCoordinate, centerCoordinate, radius, extraGapEnd, endAngle);
        ctx.stroke();

        endAngle = extraGapStart;
      } else if (startAngle < extraGapStart && endAngle > extraGapStart) {
        // Segment ends in extra gap
        endAngle = extraGapStart;
      } else if (startAngle < extraGapEnd && endAngle > extraGapEnd) {
        // Segment starts in extra gap
        startAngle = extraGapEnd;
      }
    }

    ctx.beginPath();
    ctx.arc(centerCoordinate, centerCoordinate, radius, startAngle, endAngle);
    ctx.stroke();
  });
}
