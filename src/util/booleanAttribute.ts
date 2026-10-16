/**
 * The string teact wrote for a boolean `aria-*` / enumerated attribute (`"true"` / `"false"`); `undefined` stays
 * `undefined` (no attribute). frameact removes an attribute set to `false` and writes `""` for `true` (engine gap 9).
 */
export default function booleanAttribute(value: boolean | undefined): 'true' | 'false' | undefined {
  return value === undefined ? undefined : value ? 'true' : 'false';
}
