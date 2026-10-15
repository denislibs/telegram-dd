// FOUNDATION STUB: Invoice (telegram-tt src/components/middle/message/Invoice.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import { createMemo } from 'frameact';
import { Show } from 'frameact/dom';

import type { ApiMessage } from '../../../api/types';
import type { ThemeKey } from '../../../types';

import { getMediaDimensions, getMessageInvoice } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
import {
  buildMediaFrameStyle,
  getMediaPlaceholderSize,
  PLACEHOLDER_RADIUS,
  PLACEHOLDER_SURFACE,
} from '../../common/helpers/placeholder';

import mediaStyles from './media.module.scss';

export type OwnProps = {
  message: ApiMessage;
  shouldAffectAppendix?: boolean;
  isInSelectMode?: boolean;
  isSelected?: boolean;
  theme: ThemeKey;
};

// TODO(port): the real Invoice (title, description, photo, price, appendix background).
const Invoice = (props: OwnProps) => {
  const photoSize = createMemo(() => {
    const photo = getMessageInvoice(props.message)?.photo;
    return photo ? getMediaPlaceholderSize(getMediaDimensions(photo)) : undefined;
  });

  return (
    <div role="img" aria-label="Invoice, not supported yet" class="Invoice">
      <Show
        when={photoSize()}
        fallback={<div style={`height: 3.5rem; ${PLACEHOLDER_SURFACE}; ${PLACEHOLDER_RADIUS}`} />}
      >
        {(size) => (
          <div
            class={buildClassName('invoice-image-container', mediaStyles.frame)}
            style={buildMediaFrameStyle(size())}
          />
        )}
      </Show>
    </div>
  );
};

export default Invoice;
