// FOUNDATION STUB: the middle column (telegram-tt src/components/middle/MiddleColumn.tsx) is ported with the message
// list slice. It keeps tt's props and the `#MiddleColumn` element that `Main` measures and waits for; the chat is not
// rendered yet.
export type OwnProps = {
  leftColumnRef?: () => HTMLDivElement | undefined;
  isMobile?: boolean;
};

const MiddleColumn = (props: OwnProps) => {
  return <div id="MiddleColumn" class="mask-image-enabled ui-ready" data-mobile={props.isMobile ? '' : undefined} />;
};

export default MiddleColumn;
