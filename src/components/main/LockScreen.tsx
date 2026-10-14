// FOUNDATION STUB: the passcode lock screen (telegram-tt src/components/main/LockScreen.tsx) is ported with the
// passcode milestone. It keeps tt's `OwnProps` so that `LockScreen.async.tsx` compiles.
export type OwnProps = {
  isLocked?: boolean;
};

const LockScreen = (props: OwnProps) => {
  return <div id="LockScreen" class="lock-screen-placeholder" data-locked={props.isLocked ? '' : undefined} />;
};

export default LockScreen;
