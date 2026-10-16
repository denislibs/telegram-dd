import { createMemo, createSignal } from 'frameact';
import { Show } from 'frameact/dom';

import buildStyle from '../../util/buildStyle';
import getPointerPosition from '../../util/events/getPointerPosition';
import { blobToFile } from '../../util/files';
import { clamp } from '../../util/math';
import { REM } from '../common/helpers/mediaDimensions';

import useWindowSize from '../../hooks/window/useWindowSize';

import Button from './Button';
import RangeSlider from './RangeSlider';

import styles from './ImageCropper.module.scss';

type OwnProps = {
  onChange: (file: File) => void;
  image?: HTMLImageElement;
  maxOutputSize: number;
  minOutputSize: number;
};

const PREVIEW_SIZE = 400;
const MIN_ZOOM = 100;
const MAX_ZOOM = 200;
const CROP_AREA_INSET = 0.125 * REM;
const MODAL_INLINE_PADDING = REM * 2;

const ImageCropper = (props: OwnProps) => {
  const [imagePosition, setImagePosition] = createSignal({ x: 0, y: 0 });
  const [zoom, setZoom] = createSignal(MIN_ZOOM);
  let isDraggingRef = false;
  let lastMousePositionRef = { x: 0, y: 0 };
  let lastImagePositionRef = { x: 0, y: 0 };

  const windowSize = useWindowSize();
  const previewContainerSize = createMemo(() => Math.min(PREVIEW_SIZE, windowSize().width - MODAL_INLINE_PADDING * 2));
  const scaleFactor = createMemo(() =>
    props.image ? Math.max(previewContainerSize() / props.image.width, previewContainerSize() / props.image.height) : 1,
  );
  const zoomFactor = createMemo(() => (scaleFactor() * zoom()) / 100);

  const previewImageSize = createMemo(() => {
    if (!props.image) return { width: 0, height: 0 };
    return {
      width: props.image.width * zoomFactor(),
      height: props.image.height * zoomFactor(),
    };
  });

  const clampPosition = (x: number, y: number, previewSize: { width: number; height: number }) => {
    const radius = previewContainerSize() / 2;
    const imgHalfWidth = previewSize.width / 2;
    const imgHalfHeight = previewSize.height / 2;

    const maxOffsetX = Math.max(0, imgHalfWidth - radius);
    const maxOffsetY = Math.max(0, imgHalfHeight - radius);

    return {
      x: clamp(x, -maxOffsetX, maxOffsetX),
      y: clamp(y, -maxOffsetY, maxOffsetY),
    };
  };

  const startDrag = (e: any) => {
    isDraggingRef = true;
    lastMousePositionRef = getPointerPosition(e);
    lastImagePositionRef = { ...imagePosition() };
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
  };
  const moveDrag = (e: any) => {
    if ('touches' in e && e.touches.length > 1) return;
    if (!isDraggingRef) return;
    const { x: mouseX, y: mouseY } = getPointerPosition(e);
    const deltaX = mouseX - lastMousePositionRef.x;
    const deltaY = mouseY - lastMousePositionRef.y;
    const newPosition = clampPosition(
      lastImagePositionRef.x + deltaX,
      lastImagePositionRef.y + deltaY,
      previewImageSize(),
    );
    setImagePosition(newPosition);
  };
  const endDrag = () => {
    isDraggingRef = false;
    document.removeEventListener('mousemove', moveDrag);
    document.removeEventListener('touchmove', moveDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchend', endDrag);
  };

  const handleZoomChange = (newZoom: number) => {
    const newZoomFactor = (scaleFactor() * newZoom) / 100;
    const newPreviewImageSize = {
      width: props.image!.width * newZoomFactor,
      height: props.image!.height * newZoomFactor,
    };

    const ratio = newZoom / zoom();
    const newPosition = clampPosition(imagePosition().x * ratio, imagePosition().y * ratio, newPreviewImageSize);

    setZoom(newZoom);
    setImagePosition(newPosition);
  };

  const handleCrop = () => {
    if (!props.image) return;

    const cropSize = previewContainerSize() / zoomFactor();
    const cropX = props.image.width / 2 - cropSize / 2 - imagePosition().x / zoomFactor();
    const cropY = props.image.height / 2 - cropSize / 2 - imagePosition().y / zoomFactor();

    const outputSize = Math.min(props.maxOutputSize, Math.max(props.minOutputSize, cropSize));

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(props.image, cropX, cropY, cropSize, cropSize, 0, 0, outputSize, outputSize);
    canvas.toBlob((blob) => {
      if (blob) props.onChange(blobToFile(blob, 'avatar.jpg'));
    }, 'image/jpeg');
  };

  const imageLeft = createMemo(() => (previewContainerSize() - previewImageSize().width) / 2 + imagePosition().x);
  const imageTop = createMemo(() => (previewContainerSize() - previewImageSize().height) / 2 + imagePosition().y);
  const backgroundImageStyle = createMemo(() =>
    buildStyle(
      `width: ${previewImageSize().width}px`,
      `height: ${previewImageSize().height}px`,
      `left: ${imageLeft()}px`,
      `top: ${imageTop()}px`,
    ),
  );

  const foregroundImageStyle = createMemo(() =>
    buildStyle(
      `width: ${previewImageSize().width}px`,
      `height: ${previewImageSize().height}px`,
      `left: ${imageLeft() - CROP_AREA_INSET}px`,
      `top: ${imageTop() - CROP_AREA_INSET}px`,
    ),
  );

  return (
    <Show when={props.image}>
      {(image) => (
        <div>
          <div
            class={styles.previewContainer}
            style={buildStyle(`width: ${previewContainerSize()}px`, `height: ${previewContainerSize()}px`)}
          >
            <img
              src={image().src}
              class={styles.backgroundImage}
              style={backgroundImageStyle()}
              draggable="false"
              onMouseDown={startDrag}
              onTouchStart={startDrag}
              alt=""
              role="presentation"
            />
            <div class={styles.previewMask} />
            <div class={styles.cropArea}>
              <img
                src={image().src}
                class={styles.foregroundImage}
                style={foregroundImageStyle()}
                draggable="false"
                alt=""
                role="presentation"
              />
            </div>
          </div>
          <div class={styles.bottomControls}>
            <RangeSlider
              className={styles.zoomSlider}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              value={zoom()}
              onChange={handleZoomChange}
            />
            <Button
              className={styles.confirmButton}
              round
              color="primary"
              iconName="check"
              onClick={handleCrop}
              ariaLabel="Crop"
            />
          </div>
        </div>
      )}
    </Show>
  );
};

export default ImageCropper;
