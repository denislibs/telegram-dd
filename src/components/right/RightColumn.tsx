// FOUNDATION STUB: the right column (telegram-tt src/components/right/RightColumn.tsx) is ported with the right column
// slice. It keeps tt's props and the `#RightColumn` element that `Main` waits for.
export type OwnProps = {
  isMobile?: boolean;
};

const RightColumn = (props: OwnProps) => {
  return (
    <div id="RightColumn-wrapper" data-mobile={props.isMobile ? '' : undefined}>
      <div id="RightColumn" />
    </div>
  );
};

export default RightColumn;
