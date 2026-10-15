import { createMemo } from 'frameact';
import { mergeProps, Show } from 'frameact/dom';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions } from '../../global';

import type { ThreadId } from '../../types';
import { ApiMessageEntityTypes, type LinkContext } from '../../api/types';

import { IS_TAURI } from '../../util/browser/globalEnvironment';
import { ensureProtocol, getUnicodeUrl, isSuspiciousUrl } from '../../util/browser/url';
import { MouseButton } from '../../util/browser/windowEnvironment';
import buildClassName from '../../util/buildClassName';

type OwnProps = {
  url?: string;
  text: string;
  className?: string;
  children?: JSX.Element;
  isRtl?: boolean;
  shouldSkipModal?: boolean;
  tryInstantView?: boolean;
  previewId?: string;
  chatId?: string;
  messageId?: number;
  threadId?: ThreadId;
  // Deviation (security): true while the link is under a concealed spoiler: its tooltip would show the hidden address
  isConcealed?: () => boolean;
  entityType?:
    | ApiMessageEntityTypes.Url
    | ApiMessageEntityTypes.TextUrl
    | `${ApiMessageEntityTypes.TextUrl}`
    | `${ApiMessageEntityTypes.Url}`;
};

const SafeLink = (rawProps: OwnProps) => {
  const props = mergeProps({ entityType: ApiMessageEntityTypes.Url }, rawProps) as OwnProps &
    Required<Pick<OwnProps, 'entityType'>>;
  const { openUrl } = getActions();

  const content = createMemo(() => props.children || props.text);
  const isRegularLink = createMemo(() => props.url === props.text);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (!props.url) return true;
    if (e.button !== MouseButton.Main && e.button !== MouseButton.Auxiliary) return true;

    e.preventDefault();

    const shouldOpenInNewTab = e.button === MouseButton.Auxiliary || e.ctrlKey || e.metaKey || e.shiftKey;
    const isTrustedLink = isRegularLink() && !isSuspiciousUrl(props.url);
    const linkContext: LinkContext | undefined =
      props.chatId && props.messageId
        ? { type: 'message', chatId: props.chatId, threadId: props.threadId, messageId: props.messageId }
        : undefined;
    openUrl({
      url: props.url,
      shouldSkipModal: props.shouldSkipModal || isTrustedLink,
      ignoreDeepLinks: shouldOpenInNewTab,
      tryInstant: shouldOpenInNewTab ? false : props.tryInstantView,
      previewId: props.previewId,
      linkContext,
    });

    return false;
  };

  const classNames = createMemo(() =>
    buildClassName(props.className || 'text-entity-link', isRegularLink() && 'word-break-all'),
  );

  return (
    <Show when={props.url}>
      {(url) => (
        <a
          href={ensureProtocol(url())}
          title={props.isConcealed?.() ? undefined : getUnicodeUrl(url())}
          target={IS_TAURI ? '_self' : '_blank'}
          rel="noopener noreferrer"
          class={classNames()}
          onClick={handleClick}
          onAuxClick={handleClick}
          dir={props.isRtl ? 'rtl' : 'auto'}
          data-entity-type={props.entityType}
        >
          {content()}
        </a>
      )}
    </Show>
  );
};

export default SafeLink;
