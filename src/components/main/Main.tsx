// FOUNDATION STUB: the main screen (telegram-tt src/components/main/Main.tsx) is ported with the chat list slice. It
// keeps tt's `OwnProps` so that `Main.async.tsx` (already ported) compiles; the auth flow ends here.
export interface OwnProps {
  isMobile?: boolean;
}

const Main = (props: OwnProps) => {
  return (
    <div id="Main" class="main-placeholder" data-mobile={props.isMobile ? '' : undefined}>
      Main screen (ported in a later slice)
    </div>
  );
};

export default Main;
