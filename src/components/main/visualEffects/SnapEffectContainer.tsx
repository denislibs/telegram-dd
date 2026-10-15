// FOUNDATION STUB: SnapEffectContainer (telegram-tt src/components/main/visualEffects/SnapEffectContainer.tsx) is ported with a later slice. It keeps tt's props so that
// the callers compile; it renders nothing, and `animateSnap` (the "thanos snap" of a deleted message) plays no effect:
// it returns `false`, which is tt's answer when the effect cannot play (the message is then removed without it).
export type OwnProps = Record<string, never>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SnapEffectContainer = (_props: OwnProps) => undefined;

export default SnapEffectContainer;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function animateSnap(_element: HTMLElement) {
  return false;
}
