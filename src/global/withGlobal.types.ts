// Type-level contract of `withGlobal` (checked by `pnpm typecheck`; vitest files are outside tsconfig). The codemod
// drops tt's explicit `<OwnProps>` argument: with it, `StateProps` falls back to its default and a state prop that does
// not exist must be a compile error, not `any` (review N4).
import { withGlobal } from './index';

type OwnProps = { chatId: string };
type StateProps = { isLeft?: boolean };

export function inferred(ownProps: OwnProps) {
  const props = withGlobal(ownProps, (global): StateProps => ({ isLeft: global.isSyncing }));
  const left: boolean | undefined = props.isLeft;
  const chatId: string = props.chatId;
  // @ts-expect-error a state prop that the mapper does not return
  void props.doesNotExist;
  return [left, chatId];
}

export function explicitOwnProps(ownProps: OwnProps) {
  const props = withGlobal<OwnProps>(ownProps, (global): StateProps => ({ isLeft: global.isSyncing }));
  const chatId: string = props.chatId;
  // @ts-expect-error the explicit <OwnProps> form has no state props: this is loud, never `any`
  void props.isLeft;
  return chatId;
}
