// FOUNDATION STUB: Contact (telegram-tt src/components/middle/message/Contact.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import type { ApiContact } from '../../../api/types';

import { PLACEHOLDER_RADIUS, PLACEHOLDER_SURFACE } from '../../common/helpers/placeholder';

export type OwnProps = {
  contact: ApiContact;
  noUserColors?: boolean;
};

const UNREGISTERED_CONTACT_ID = '0';
// The info row (avatar 2.75rem + paddings) and, for a registered contact, the divider and the button row.
const INFO_HEIGHT_REM = 3.75;
const BUTTONS_HEIGHT_REM = 2.5;

// TODO(port): the real Contact (avatar, name, phone, chat / add-contact buttons).
const Contact = (props: OwnProps) => {
  const height = () => INFO_HEIGHT_REM + (props.contact.userId !== UNREGISTERED_CONTACT_ID ? BUTTONS_HEIGHT_REM : 0);

  return (
    <div
      role="img"
      aria-label="Contact, not supported yet"
      style={`width: 15rem; max-width: 100%; height: ${height()}rem; margin-top: 0.25rem; margin-bottom: var(--message-meta-height); ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`}
    />
  );
};

export default Contact;
