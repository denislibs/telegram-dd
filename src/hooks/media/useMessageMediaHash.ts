import { type Accessor, createMemo } from 'frameact';

import type { MediaContainer, SizeTarget } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { getMessageMediaHash } from '../../global/helpers/messageMedia';
import { type MaybeAccessor, read } from '../../util/accessors';
import useSelector from '../data/useSelector';

function selectWebPagesById(global: GlobalState) {
  return global.messages.webPageById;
}

// Deviation: arguments are `MaybeAccessor`s and the result is an accessor (frameact hooks run once).
export default function useMessageMediaHash(
  message: MaybeAccessor<MediaContainer | undefined>,
  target: MaybeAccessor<SizeTarget>,
): Accessor<string | undefined> {
  const webPagesById = useSelector(selectWebPagesById);

  return createMemo(() => {
    const message2 = read(message);
    if (!message2) return undefined;

    const webPageId = message2.content.webPage?.id;
    const webPage = webPageId ? webPagesById()[webPageId] : undefined;

    return getMessageMediaHash(message2, { webPage }, read(target));
  });
}
