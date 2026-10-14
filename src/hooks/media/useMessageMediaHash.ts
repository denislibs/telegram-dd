import { createMemo } from 'frameact';

import type { MediaContainer, SizeTarget } from '../../api/types';
import type { GlobalState } from '../../global/types';

import { getMessageMediaHash } from '../../global/helpers/messageMedia';
import useSelector from '../data/useSelector';

function selectWebPagesById(global: GlobalState) {
  return global.messages.webPageById;
}

// TODO(codemod): useMessageMediaHash: a hook runs once; take accessors (() => x) for reactive parameters and return accessors
export default function useMessageMediaHash(message: MediaContainer | undefined, target: SizeTarget) {
  const webPagesById = useSelector(selectWebPagesById);
  if (!message) return undefined;

  const webPageId = message.content.webPage?.id;
  const webPage = createMemo(() => (webPageId ? webPagesById()[webPageId] : undefined));

  return getMessageMediaHash(message, { webPage: webPage() }, target);
}
