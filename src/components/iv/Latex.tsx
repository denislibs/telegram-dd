// FOUNDATION STUB: Latex (telegram-tt src/components/iv/Latex.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders the raw LaTeX source as text.
// Deviation: the temml renderer (util/renderLatex) is not ported, so the source is shown as is (tt's own fallback when
// rendering fails).
type OwnProps = {
  source: string;
  isBlock?: boolean;
};

const Latex = (props: OwnProps) => {
  return (
    <span data-rich-text-type={props.isBlock ? undefined : 'math'} data-source={props.source}>
      {props.source}
    </span>
  );
};

export default Latex;
