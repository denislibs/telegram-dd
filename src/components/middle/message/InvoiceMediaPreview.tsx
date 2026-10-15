// FOUNDATION STUB: InvoiceMediaPreview (telegram-tt src/components/middle/message/InvoiceMediaPreview.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders an inert, sized placeholder (tt's outer element and classes, nothing loaded).
import { createMemo } from 'frameact';

import type { ApiMessage } from '../../../api/types';

import { getMediaDimensions, getMessageInvoice } from '../../../global/helpers';
import buildClassName from '../../../util/buildClassName';
import { buildMediaFrameStyle, getMediaPlaceholderSize } from '../../common/helpers/placeholder';

import mediaStyles from './media.module.scss';

export type OwnProps = {
  message: ApiMessage;
  isConnected: boolean;
};

// TODO(port): the real InvoiceMediaPreview (spoiler thumbnail, duration, checkout button, extended media polling).
const InvoiceMediaPreview = (props: OwnProps) => {
  const size = createMemo(() => {
    const extendedMedia = getMessageInvoice(props.message)?.extendedMedia;
    return getMediaPlaceholderSize(extendedMedia ? getMediaDimensions(extendedMedia) : undefined);
  });

  return (
    <div
      role="img"
      aria-label="Paid media, not supported yet"
      class={buildClassName(mediaStyles.frame, mediaStyles.intrinsic, 'media-inner')}
      style={buildMediaFrameStyle(size())}
    />
  );
};

export default InvoiceMediaPreview;
