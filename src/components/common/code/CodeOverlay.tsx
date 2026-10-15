import { createEffect, createMemo, createSignal } from 'frameact';
import { getActions } from '../../../global';
import { depsOf } from '../../../util/effectDeps';

import buildClassName from '../../../util/buildClassName';
import { copyTextToClipboard } from '../../../util/clipboard';
import { areLinesWrapping } from '../helpers/renderText';

import useOldLang from '../../../hooks/useOldLang';
import useWindowSize from '../../../hooks/window/useWindowSize';

import Icon from '../icons/Icon';

import styles from './CodeOverlay.module.scss';

export type OwnProps = {
  className?: string;
  text: string;
  noCopy?: boolean;
  onWordWrapToggle?: (wrap: boolean) => void;
};

const CodeOverlay = (props: OwnProps) => {
  const { showNotification } = getActions();
  let ref!: HTMLDivElement;
  const windowSize = useWindowSize();
  const lang = useOldLang();
  const [isWordWrap, setIsWordWrap] = createSignal(true);
  const [withWordWrapButton, setWithWordWrapButton] = createSignal(false);

  const checkWordWrap = () => {
    const isWrap = areLinesWrapping(props.text, ref!.parentElement!);
    setWithWordWrapButton(isWrap);
  };

  createEffect(depsOf(() => [checkWordWrap, isWordWrap(), props.text, windowSize] as const), ([checkWordWrap2, isWordWrap2, text2]) => {
    if (isWordWrap2) {
      checkWordWrap2();
    }
  });

  const handleCopy = () => {
    copyTextToClipboard(props.text);
    showNotification({
      message: lang('TextCopied'),
    });
  };

  const handleWordWrapClick = () => {
    setIsWordWrap(!isWordWrap());
    props.onWordWrapToggle?.(!isWordWrap());
  };

  const contentClass = createMemo(() => buildClassName(styles.content, !withWordWrapButton() && props.noCopy && styles.hidden));
  const overlayClass = createMemo(() => buildClassName(styles.overlay, props.className));
  const wrapClass = createMemo(() => buildClassName(styles.wrap, isWordWrap() && styles.wrapOn));

  return (
    <div class={overlayClass()} ref={ref}>
      <div class={contentClass()}>
        {withWordWrapButton() && (
          <div class={wrapClass()} onClick={handleWordWrapClick} title="Word Wrap">
            <Icon name="word-wrap" />
          </div>
        )}
        {!props.noCopy && (
          <div class={styles.copy} onClick={handleCopy} title={lang('Copy')}>
            <Icon name="copy" />
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeOverlay;
