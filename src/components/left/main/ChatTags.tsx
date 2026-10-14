import { createMemo } from 'frameact';
import { For, Show } from 'frameact/dom';

import { type ApiChatFolder, ApiMessageEntityTypes } from '../../../api/types';

import buildClassName from '../../../util/buildClassName';
import { REM } from '../../common/helpers/mediaDimensions';
import { renderTextWithEntities } from '../../common/helpers/renderTextWithEntities';

import { getPeerColorClass } from '../../../hooks/usePeerColor';

import styles from './ChatTags.module.scss';

const MAX_VISIBLE_TAGS = 3;
const CUSTOM_EMOJI_SIZE = 0.875 * REM;

type OwnProps = {
  orderedFolderIds?: number[];
  chatFoldersById?: Record<number, ApiChatFolder>;
  isFoldersSidebarShown?: boolean;
  itemClassName?: string;
};

const ChatTags = (props: OwnProps) => {
  const visibleFolderIds = createMemo(() => props.orderedFolderIds.slice(0, MAX_VISIBLE_TAGS));
  const remainingCount = createMemo(() => props.orderedFolderIds.length - visibleFolderIds().length);

  function getFolderTitle(folder: ApiChatFolder) {
    let text = folder.title.text;
    let entities = folder.title.entities;

    if (props.isFoldersSidebarShown) {
      const currentCustomEmoji = folder.title.entities?.find(
        (entity) => entity.type === ApiMessageEntityTypes.CustomEmoji && entity.offset === 0,
      );
      if (currentCustomEmoji) {
        const { offset, length } = currentCustomEmoji;

        text = folder.title.text.replace(folder.title.text.substring(offset, offset + length), '');
        entities = folder.title.entities
          ?.filter((entity) => entity.offset !== offset)
          .map((entity) => ({
            ...entity,
            offset: entity.offset - length,
          }));
      }
    }
    return renderTextWithEntities({
      text,
      entities,
      noCustomEmojiPlayback: folder.noTitleAnimations,
      emojiSize: CUSTOM_EMOJI_SIZE,
    });
  }

  return (
    <Show when={props.orderedFolderIds}>
      <div class={styles.wrapper}>
        <For each={visibleFolderIds()}>
          {(folderId) => {
            const folder = props.chatFoldersById?.[folderId];
            return (
              folder && (
                <div
                  class={buildClassName(
                    styles.tag,
                    folder.color !== undefined && folder.color !== -1 && getPeerColorClass(folder.color),
                    props.itemClassName,
                  )}
                >
                  {getFolderTitle(folder)}
                </div>
              )
            );
          }}
        </For>
        {remainingCount() > 0 && (
          <div class={buildClassName(styles.tag, styles.tagColorMore, props.itemClassName)}>+{remainingCount()}</div>
        )}
      </div>
    </Show>
  );
};

export default ChatTags;
