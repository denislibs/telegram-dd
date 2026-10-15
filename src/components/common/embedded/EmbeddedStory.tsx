import { createMemo } from 'frameact';
import { getActions } from '../../../global';

import type { ApiPeer, ApiTypeStory } from '../../../api/types';

import { getPeerTitle } from '../../../global/helpers/peers';
import buildClassName from '../../../util/buildClassName';
import renderText from '../helpers/renderText';

import { useFastClick } from '../../../hooks/useFastClick';
import useOldLang from '../../../hooks/useOldLang';

import CompactMediaPreview, { canRenderCompactMediaPreview } from '../CompactMediaPreview';
import Icon from '../icons/Icon';
import PeerColorWrapper from '../PeerColorWrapper';

import './EmbeddedMessage.scss';

type OwnProps = {
  story?: ApiTypeStory;
  sender?: ApiPeer;
  noUserColors?: boolean;
  isProtected?: boolean;
  observeIntersectionForLoading?: ObserveFn;
  observeIntersectionForPlaying?: ObserveFn;
  onClick: NoneToVoidFunction;
};

const NBSP = '\u00A0';

const EmbeddedStory = (props: OwnProps) => {
  const { showNotification } = getActions();

  const lang = useOldLang();
  const isFullStory = createMemo(() => props.story && 'content' in props.story);
  const isExpiredStory = createMemo(() => props.story && 'isDeleted' in props.story);
  const title = createMemo(() => isFullStory() ? 'Story' : isExpiredStory() ? 'ExpiredStory' : 'Loading');

  const hasPictogram = createMemo(() => isFullStory() && canRenderCompactMediaPreview(props.story.content));

  const senderTitle = createMemo(() => props.sender ? getPeerTitle(lang, props.sender) : undefined);
  const handleFastClick = () => {
    if (props.story && !isExpiredStory()) {
      props.onClick();
    } else {
      showNotification({
        message: lang('StoryNotFound'),
      });
    }
  };

  const { handleClick, handleMouseDown } = useFastClick(handleFastClick);

  return (
    <PeerColorWrapper
      peerColor={props.sender?.color}
      noUserColors={props.noUserColors}
      shouldReset
      className={buildClassName('EmbeddedMessage', hasPictogram() && 'with-thumb')}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      {isFullStory() && hasPictogram() && (
        <CompactMediaPreview
          media={props.story.content}
          className="embedded-thumb"
          isPictogram
          isProtected={props.isProtected}
          observeIntersectionForLoading={props.observeIntersectionForLoading}
          observeIntersectionForPlaying={props.observeIntersectionForPlaying}
        />
      )}
      <div class="message-text with-message-color">
        <p class="embedded-text-wrapper">
          {isExpiredStory() && <Icon name="story-expired" className="embedded-origin-icon" />}
          {isFullStory() && <Icon name="story-reply" className="embedded-origin-icon" />}
          {lang(title())}
        </p>
        <div class="message-title">{renderText(senderTitle() || NBSP)}</div>
      </div>
    </PeerColorWrapper>
  );
};

export default EmbeddedStory;
