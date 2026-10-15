import { createMeasureEffect, createMemo, createSignal, requestMeasure, requestMutation } from 'frameact';
import { For } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';

import buildClassName from '../../util/buildClassName';
import { depsOf } from '../../util/effectDeps';
import { REM } from './helpers/mediaDimensions';
import renderText from './helpers/renderText';

import { useFastClick } from '../../hooks/useFastClick';
import useLang from '../../hooks/useLang';

import styles from './ChatGroupedLastMessage.module.scss';

export type GroupedLastMessageItem = {
  key: string | number;
  title: string;
  isUnread?: boolean;
  icon?: JSX.Element;
};

type OwnProps = {
  // `undefined` while the items are still loading
  items?: GroupedLastMessageItem[];
  hasTags?: boolean;
  renderLastMessage: () => JSX.Element | undefined;
  // Returns `true` when the click is handled, so it does not open the chat itself
  onMainItemClick?: () => boolean;
};

const NO_CORNER_THRESHOLD = Number(REM);
const ICON_CLASS_NAME = buildClassName(styles.icon, 'in-text-icon');

// A chat list subtitle that groups a chat's parts (forum topics, community chats)
// on one row and previews the freshest one's last message below, connecting
// both with a bubble when that part is unread
const ChatGroupedLastMessage = (props: OwnProps) => {
  let lastMessageRef!: HTMLDivElement;
  let mainColumnRef!: HTMLDivElement;

  const mainItem = createMemo(() => props.items?.[0]);
  const otherItems = createMemo(() => props.items?.slice(1) ?? []);
  // Deviation: tt re-ran the measuring effect whenever `renderLastMessage` was a new function (every parent render);
  // the rendered last message is a memo here so the effect re-measures when the preview re-renders.
  const lastMessage = createMemo(() => props.renderLastMessage());

  const lang = useLang();

  const [isReversedCorner, setIsReversedCorner] = createSignal(false);
  const [overwrittenWidth, setOverwrittenWidth] = createSignal<number | undefined>(undefined);

  const { handleClick: handleMainItemClick, handleMouseDown: handleMainItemMouseDown } = useFastClick(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!props.onMainItemClick?.()) return;

      e.stopPropagation();
      e.preventDefault();
    },
  );

  createMeasureEffect(
    depsOf(() => [mainItem(), lastMessage(), props.hasTags] as const),
    ([, , hasTags]) => {
      if (hasTags) return undefined;

      let isCancelled = false;

      requestMeasure(() => {
        const lastMessageElement = lastMessageRef;
        const mainColumnElement = mainColumnRef;
        if (isCancelled || !lastMessageElement || !mainColumnElement) return;

        const lastMessageWidth = lastMessageElement.offsetWidth;
        const mainColumnWidth = mainColumnElement.offsetWidth;

        requestMutation(() => {
          if (isCancelled) return;

          setOverwrittenWidth(
            Math.abs(lastMessageWidth - mainColumnWidth) < NO_CORNER_THRESHOLD
              ? Math.max(lastMessageWidth, mainColumnWidth)
              : undefined,
          );
          setIsReversedCorner(lastMessageWidth > mainColumnWidth);
        });
      });

      return () => {
        isCancelled = true;
      };
    },
  );

  return (
    <div
      class={buildClassName(
        styles.root,
        isReversedCorner() && styles.reverseCorner,
        overwrittenWidth() && styles.overwrittenWidth,
      )}
      dir={lang.isRtl ? 'rtl' : undefined}
      style={overwrittenWidth() ? `--overwritten-width: ${overwrittenWidth()}px` : undefined}
    >
      {!props.hasTags && (
        <>
          {mainItem() && (
            <div class={styles.titleRow}>
              <div
                class={buildClassName(styles.mainColumn, mainItem()?.isUnread && styles.unread)}
                ref={mainColumnRef}
                onClick={handleMainItemClick}
                onMouseDown={handleMainItemMouseDown}
              >
                {Boolean(mainItem()?.icon) && <span class={ICON_CLASS_NAME}>{mainItem()?.icon}</span>}
                <div class={styles.title}>{renderText(mainItem()?.title ?? '')}</div>
                {!overwrittenWidth() && isReversedCorner() && (
                  <div class={styles.afterWrapper}>
                    <div class={styles.after} />
                  </div>
                )}
              </div>

              <div class={styles.otherColumns}>
                <For each={otherItems()} keyed={(item) => item.key}>
                  {(item) => (
                    <div class={buildClassName(styles.otherColumn, item().isUnread && styles.unread)}>
                      {Boolean(item().icon) && <span class={ICON_CLASS_NAME}>{item().icon}</span>}
                      <span class={styles.otherColumnTitle}>{renderText(item().title)}</span>
                    </div>
                  )}
                </For>
              </div>

              <div class={styles.ellipsis} />
            </div>
          )}
          {!props.items && <div class={buildClassName(styles.titleRow, styles.loading)}>{lang('Loading')}</div>}
        </>
      )}
      <div
        class={buildClassName(styles.lastMessage, mainItem()?.isUnread && !props.hasTags && styles.unread)}
        ref={lastMessageRef}
        onClick={handleMainItemClick}
        onMouseDown={handleMainItemMouseDown}
      >
        {lastMessage()}
        {!overwrittenWidth() && !isReversedCorner() && (
          <div class={styles.afterWrapper}>
            <div class={styles.after} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatGroupedLastMessage;
