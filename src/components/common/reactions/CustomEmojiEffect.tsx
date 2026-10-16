import { createMemo } from 'frameact';
import { For, Show } from 'frameact/dom';

import type { ApiEmojiStatusType, ApiReactionCustomEmoji } from '../../../api/types';

import { getStickerHashById } from '../../../global/helpers';
import { IS_OFFSET_PATH_SUPPORTED } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';
import buildStyle from '../../../util/buildStyle';

import useMedia from '../../../hooks/useMedia';

import CustomEmoji from '../CustomEmoji';

import styles from './CustomEmojiEffect.module.scss';

type OwnProps = {
  // Deviation: tt handed the transition class names in `className`; the caller's transition `ref` is applied to the root.
  ref?: (el: HTMLElement) => void;
  reaction: ApiReactionCustomEmoji | ApiEmojiStatusType;
  className?: string;
  isLottie?: boolean;
  particleSize?: number;
  onEnded?: NoneToVoidFunction;
};

const EFFECT_AMOUNT = 7;

const CustomEmojiEffect = (props: OwnProps) => {
  const stickerHash = createMemo(() => getStickerHashById(props.reaction.documentId, true));

  const previewMediaData = useMedia(() => (!props.isLottie ? stickerHash() : undefined));

  const paths = createMemo((): string[] => {
    if (!IS_OFFSET_PATH_SUPPORTED) return [];
    return Array.from({ length: EFFECT_AMOUNT }).map(() => generateRandomDropPath(props.particleSize));
  });

  return (
    <Show when={previewMediaData() || props.isLottie}>
      <div
        ref={(el) => props.ref?.(el)}
        class={buildClassName(styles.root, props.className)}
        style={buildStyle(Boolean(props.particleSize) && `--particle-size: ${props.particleSize}px`)}
      >
        <For each={paths()}>
          {(path, i) => {
            const style = `--offset-path: path('${path}');`;
            if (props.isLottie) {
              return (
                <CustomEmoji
                  documentId={props.reaction.documentId}
                  className={styles.particle}
                  style={style}
                  withSharedAnimation
                  size={props.particleSize}
                  onAnimationEnd={i() === 0 ? props.onEnded : undefined}
                />
              );
            }

            return (
              <img
                src={previewMediaData()}
                alt=""
                class={styles.particle}
                style={style}
                draggable="false"
                onAnimationEnd={i() === 0 ? props.onEnded : undefined}
              />
            );
          }}
        </For>
      </div>
    </Show>
  );
};

export default CustomEmojiEffect;

function generateRandomDropPath(particleSize = 20) {
  const x = (particleSize / 2 + Math.random() * particleSize * 3) * (Math.random() > 0.5 ? 1 : -1);
  const y = particleSize + Math.random() * particleSize * 4;

  return `M 0 0 C 0 0 ${x} ${-y - particleSize} ${x} ${y}`;
}
