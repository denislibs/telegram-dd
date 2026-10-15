import { createEffect, createMemo, requestMutation } from 'frameact';
import { mergeProps } from 'frameact/dom';
import { depsOf } from '../../util/effectDeps';

import { animate, timingFunctions } from '../../util/animation';
import buildClassName from '../../util/buildClassName';

import useDynamicColorListener from '../../hooks/stickers/useDynamicColorListener';
import { useStateRef } from '../../hooks/useStateRef';
import useDevicePixelRatio from '../../hooks/window/useDevicePixelRatio';

import Icon from '../common/icons/Icon';

import './ProgressSpinner.scss';

type OwnProps = {
  progress?: number;
  size?: 's' | 'm' | 'l' | 'xl';
  square?: boolean;
  transparent?: boolean;
  noCross?: boolean;
  rotationOffset?: number;
  withColor?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement, MouseEvent>) => void;
};

const SIZES = {
  s: 42,
  m: 48,
  l: 54,
  xl: 52,
};
const STROKE_WIDTH = 2;
const STROKE_WIDTH_XL = 3;
const PADDING = 2;
const MIN_PROGRESS = 0.05;
const MAX_PROGRESS = 1;
const GROW_DURATION = 600; // 0.6 s
const ROTATE_DURATION = 2000; // 2 s

const ProgressSpinner = (rawProps: OwnProps) => {
  const props = mergeProps({ progress: 0, size: 'l' }, rawProps) as OwnProps & Required<Pick<OwnProps, 'progress' | 'size'>>;
  let canvasRef!: HTMLCanvasElement;
  const width = createMemo(() => SIZES[props.size]);
  // TODO(codemod): useStateRef: a handler reads the current value through the accessor; replace ref.current with the accessor call
  const progressRef = useStateRef(props.progress);

  const dpr = useDevicePixelRatio();

  const color = useDynamicColorListener(() => canvasRef, undefined, () => !props.withColor);

  createEffect(depsOf(() => [progressRef, props.size, width(), dpr, props.rotationOffset, color] as const), ([, size2, width2, , rotationOffset2]) => {
    let isFirst = true;
    let growFrom = MIN_PROGRESS;
    let growStartedAt: number | undefined;
    let prevProgress: number | undefined;

    animate(() => {
      if (!canvasRef) {
        return false;
      }

      if (progressRef.current !== prevProgress) {
        growFrom = Math.min(Math.max(MIN_PROGRESS, prevProgress || 0), MAX_PROGRESS);
        growStartedAt = Date.now();
        prevProgress = progressRef.current;
      }

      const targetProgress = Math.min(Math.max(MIN_PROGRESS, progressRef.current), MAX_PROGRESS);
      const t = Math.min(1, (Date.now() - growStartedAt!) / GROW_DURATION);
      const animationFactor = timingFunctions.easeOutQuad(t);
      const currentProgress = growFrom + (targetProgress - growFrom) * animationFactor;

      drawSpinnerArc(
        canvasRef,
        width2 * dpr,
        (size2 === 'xl' ? STROKE_WIDTH_XL : STROKE_WIDTH) * dpr,
        color ?? 'white',
        currentProgress,
        dpr,
        isFirst,
        rotationOffset2,
      );

      isFirst = false;

      return currentProgress < 1;
    }, requestMutation);
  });

  const className = createMemo(() => buildClassName(
    `ProgressSpinner size-${props.size}`,
    props.transparent && 'transparent',
    props.square && 'square',
    props.noCross && 'no-cross',
  ));

  return (
    <div class={className()} onClick={(e) => props.onClick?.(e)}>
      {!props.noCross && <Icon name="close" />}
      <canvas ref={canvasRef} class="ProgressSpinner_canvas" style={`width: ${width()}px; height: ${width()}px;`} />
    </div>
  );
};

function drawSpinnerArc(
  canvas: HTMLCanvasElement,
  size: number,
  strokeWidth: number,
  color: string,
  progress: number,
  dpr: number,
  shouldInit = false,
  rotationOffset?: number,
) {
  const centerCoordinate = size / 2;
  const radius = (size - strokeWidth) / 2 - PADDING * dpr;
  const offset = rotationOffset ?? (Date.now() % ROTATE_DURATION) / ROTATE_DURATION;
  const startAngle = 2 * Math.PI * offset;
  const endAngle = startAngle + 2 * Math.PI * progress;
  const ctx = canvas.getContext('2d')!;

  if (shouldInit) {
    canvas.width = size;
    canvas.height = size;

    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
  }

  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(centerCoordinate, centerCoordinate, radius, startAngle, endAngle);
  ctx.stroke();
}

export default ProgressSpinner;
