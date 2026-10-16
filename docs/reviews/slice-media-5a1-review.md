# Review: slice 5a-1 (media infrastructure, photo, video, round video, album)

Done in the main session after the subagent quota ran out. Scope: the diff `origin/main...port/media`, against
`reference/telegram-tt` and the plan `docs/plans/2026-10-15-media.md`. Verdict: no blocking findings.

## Security

- **Service worker** (`serviceWorker/{service.worker,progressive,download}.ts`, `util/setupServiceWorker.ts`): byte-identical to tt
  apart from formatting and the removed PWA parts (push, share, asset cache: `// Deviation`, TODO(port) for the PWA milestone).
  The worker's own `message` listener for part responses stays (`progressive.ts`).
  - Minor (tt parity): `respondForProgressive` reads `bytes[1]` of a `Range` regex match; a request without `Range` throws
    inside the handler (a network error for that request only).
  - Deployment note: `Service-Worker-Allowed: /` is set by the dev server only; the production host must send it.
- **Downloads:** `sanitizeDownloadFilename` strips C0/C1 and bidi/zero-width controls, path characters and leading/trailing dots,
  and caps the length with the extension kept. It is applied in `DownloadManager` (also to the `?filename=` of `./download/`)
  and in `downloadOne`. The "shown name equals saved name" check belongs to the document component (5a-2).
- **Untrusted numbers:** dimensions (1–8192 px, ratio 0.1–10), durations (badge ≤ 99:59:59), progress ([0, 1]),
  `currentTime / duration` (NaN/Infinity guarded), album parts (≤ 10, D5). Covered by unit tests (NaN, 0, -5, 1e9, Infinity).
  - Minor: the ratio clamp changes the box of a legitimate extreme panorama (> 10:1) compared with tt.
- **Blob URLs:** never revoked, as in tt (session cache); the leak gate asserts no new blob per cycle.
- **Test-only code:** the media mock, its middleware and assets are absent from a production build without `APP_MOCKED_CLIENT`
  (checked by the implementer in `dist/`). `requestMediaWorker` now starts the media workers under APP_ENV=test too
  (`isForced`); `launchMediaWorkers()` itself is unchanged in production.

## Fidelity

- `Photo`, `Video`, `RoundVideo`, `Album`: the hand edits after the codemod keep tt's semantics. Spot-checked against tt:
  - load and play flags initialised once (`useState(canAutoLoad)`, `useState(canAutoPlay && !isSpoilerShown)`), as in tt;
  - `wasIntersected` is sticky, as tt's ref;
  - `noMountTransition` from `usePreviousDeprecated(isLoadAllowed) === false` is always false at mount in tt too;
  - a revealed spoiler stays revealed on message updates; `MediaSpoiler` is created only once a spoiler was shown;
  - the album layout is recomputed only when a ratio changes.
- Minor deviation: `Album` drops a part without a photo or a video before the layout (tt indexed the layout by message position
  and read `undefined` for such a part).
- Visual vs tt at 0 px on `media-photos`, `media-photos-top`, `media-spoiler`, `media-videos` (video boxes masked) and on all
  earlier screens.

## Performance

`perf:compare open-media-chat` (9 runs, calibrated ×3.88): dd is ahead of tt on every metric. Long tasks 2 vs 4, script 354 vs
650 ms, TBT 122 vs 259 ms, frames dropped 18 vs 30, DOM mutations 528 vs 1964, heap 11.2 vs 13.5 MB. Nodes per message:
plain photo 15, photo with caption 26, 2-album 24 (target < +40 over a text message). Leak gates: 0 DOM nodes, 0 listeners,
0 new blobs per cycle, no retained `<video>`.

## Engine gaps (for frameact)

`mergeProps` and a later source's `undefined`; `createMutationEffect` applying synchronously at creation (codemod's
`useLayoutEffect` mapping); `<video>` JSX types lack `defaultMuted`. Details in `docs/reports/slice-media-5a1.md`.
