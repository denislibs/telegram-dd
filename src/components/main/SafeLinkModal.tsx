import { createMemo } from 'frameact';
import type { JSX } from 'frameact/jsx-runtime';
import { getActions } from '../../global';

import convertPunycode from '../../lib/punycode';
import {
  ensureProtocol,
  getSuspiciousDomainCharacters,
  hasSuspiciousUrlCredentials,
  isSuspiciousUrl,
} from '../../util/browser/url';
import buildClassName from '../../util/buildClassName';
import renderText from '../common/helpers/renderText';

import useLang from '../../hooks/useLang';

import Icon from '../common/icons/Icon';
import ConfirmDialog from '../ui/ConfirmDialog';

import styles from './SafeLinkModal.module.scss';

export type OwnProps = {
  // Deviation: `modal` (the URL) may be absent: the modal is always rendered, and is open while there is a URL (tt's
  // `ModalContainer` renders it by the tab state, which is not ported yet)
  url?: string;
};

const URL_PARTS_PATTERN = /^([a-z][a-z\d+.-]*:\/\/)([^/?#]*@)?(\[[^\]]+\]|[^:/?#]+)(.*)$/i;
const INVISIBLE_CHARACTER_PATTERN = /[\p{Default_Ignorable_Code_Point}\p{Cc}]/gu;

// Deviation: tt's modal is the `@gili/modal` one (a slim modal with a header and footer actions). It is a `ConfirmDialog` here,
// the dialog of this app that has a title, a text and the two buttons; the text, the rendering of the address (the host split
// into labels, the suspicious characters, credentials and invisible characters marked) and the warning are tt's.
const SafeLinkModal = (props: OwnProps) => {
  const { toggleSafeLinkModal } = getActions();

  const lang = useLang();
  // The URL of the last open state: the dialog fades out with it
  let lastUrl = '';
  const url = createMemo(() => {
    if (props.url) lastUrl = props.url;
    return lastUrl;
  });
  const isOpen = () => Boolean(props.url);
  const renderedUrl = createMemo(() => renderUrl(url()));
  const isSuspicious = createMemo(() => Boolean(url()) && isSuspiciousUrl(url()));

  const handleOpen = () => {
    window.open(ensureProtocol(url()), '_blank', 'noopener noreferrer');
    toggleSafeLinkModal({ url: undefined });
  };

  const handleDismiss = () => {
    toggleSafeLinkModal({ url: undefined });
  };

  return (
    <ConfirmDialog
      isOpen={isOpen()}
      title={lang('OpenUrlTitle')}
      confirmLabel={lang('OpenUrlConfirm')}
      confirmHandler={handleOpen}
      onClose={handleDismiss}
    >
      {renderText(
        lang(
          'OpenUrlText',
          {
            url: (
              <span class={styles.url} dir="ltr">
                {renderedUrl()}
              </span>
            ),
          },
          { withNodes: true, withMarkdown: true },
        ),
      )}
      {isSuspicious() && (
        <p class={styles.warning}>
          <Icon className={buildClassName(styles.riskIcon, 'in-text-icon')} name="info-filled" />
          {lang('OpenUrlWarning')}
        </p>
      )}
    </ConfirmDialog>
  );
};

export default SafeLinkModal;

function renderUrl(url: string): JSX.Element {
  if (!url) return undefined;

  try {
    // Split the serialized URL so highlighting follows the browser's actual destination
    const parsedUrl = new URL(ensureProtocol(url));
    const parts = parsedUrl.href.match(URL_PARTS_PATTERN);
    if (!parts) return formatUrlPart(parsedUrl.href);

    const [, protocol, credentials, hostname, suffix] = parts;
    const domain = convertPunycode(hostname);

    return (
      <>
        {protocol}
        {credentials && (
          <>
            <span class={hasSuspiciousUrlCredentials(parsedUrl) ? styles.suspicious : undefined}>
              {formatUrlPart(credentials.slice(0, -1))}
            </span>
            @
          </>
        )}
        <span class={styles.domain}>
          {domain.split('.').map((label, index) => (
            <>
              {index > 0 && '.'}
              {renderDomainLabel(label)}
            </>
          ))}
        </span>
        {formatUrlPart(suffix)}
      </>
    );
  } catch {
    return <span class={styles.suspicious}>{formatUrlPart(url)}</span>;
  }
}

function renderDomainLabel(label: string) {
  const suspiciousCharacters = getSuspiciousDomainCharacters(label);
  if (!suspiciousCharacters.size) return formatUrlPart(label);

  return Array.from(label, (character) =>
    suspiciousCharacters.has(character) ? <span class={styles.suspicious}>{formatUrlPart(character)}</span> : character,
  );
}

function formatUrlPart(part: string) {
  let decodedPart = part;
  try {
    decodedPart = decodeURI(part);
  } catch {
    // Malformed escape sequences remain visible
  }

  // Keep invisible and direction-changing characters visible instead of letting them disguise the URL
  return decodedPart.replace(INVISIBLE_CHARACTER_PATTERN, encodeURIComponent);
}
