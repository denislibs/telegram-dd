// FOUNDATION STUB: SponsoredMessage (telegram-tt src/components/middle/message/SponsoredMessage.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing.
import type { ObserveFn } from '../../../hooks/useIntersectionObserver';

export type OwnProps = {
  chatId: string;
  containerRef: () => HTMLDivElement | undefined;
  observeIntersectionForLoading: ObserveFn;
  observeIntersectionForPlaying: ObserveFn;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SponsoredMessage = (_props: OwnProps) => undefined;

export default SponsoredMessage;
