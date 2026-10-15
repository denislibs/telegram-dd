
import buildClassName from '../../util/buildClassName';

import useFocusMessageListElement from './message/hooks/useFocusMessageListElement';

type OwnProps = {
  isFocused?: boolean;
  className?: string;
};

const MessageListBottomMarker = (props: OwnProps) => {
  let ref!: HTMLDivElement;

  useFocusMessageListElement({
    elementRef: () => ref,
    isJustAdded: true,
    isFocused: () => props.isFocused,
    noFocusHighlight: true,
  });

  return <div ref={ref} class={buildClassName('list-bottom-marker', props.className)} />;
};

export default MessageListBottomMarker;
