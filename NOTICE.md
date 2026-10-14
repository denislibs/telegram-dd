# NOTICE

telegram-dd is a Telegram web client. It is a **modified version of Telegram Web A**
([Ajaxy/telegram-tt](https://github.com/Ajaxy/telegram-tt)), ported from the teact framework to frameact.

## License of this work

- telegram-dd as a whole is licensed under the **GNU General Public License, version 3 or (at your option) any later
  version** (GPL-3.0-or-later). The full text is in [`LICENSE`](LICENSE).
- telegram-tt is © **Alexander Zinchuk and the telegram-tt contributors**, licensed GPL-3.0-or-later. (telegram-tt's
  `LICENSE` file is the bare GPL text with no copyright line; the holder above is the `author` field of its
  `package.json`. The full list of authors is the upstream git history.)
- This program is distributed WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE. See the GNU General Public License for more details.

### Modification notice (GPL-3.0 §5(a))

Starting in October 2026, the telegram-dd contributors modified telegram-tt: its files are copied into this repository
under their original paths and adapted from teact (`src/lib/teact`, `src/lib/fasterdom`, TeactN global state) to
frameact (signals, two-phase effects, store model B). The baseline is telegram-tt commit
[`090e38f`](https://github.com/Ajaxy/telegram-tt/commit/090e38f1dffec3e0a9aefbec8159a9931fbeec8f) (version 12.0.46,
2026-10-12). For any file, `git log --follow <path>` shows its import commit, which names the telegram-tt commit it
came from, and every change made after that. The file-header policy is in
[`docs/porting-guide.md`](docs/porting-guide.md#1-licensing-rules-for-porters).

## What comes from telegram-tt

- **Code**: components (`src/components`), hooks (`src/hooks`), global state (actions, reducers, selectors, types under
  `src/global`), the API layer (`src/api`: the GramJS worker, builders, methods, update handling), utilities
  (`src/util`), the bundles (`src/bundles`), the service worker (`src/serviceWorker`), the libraries under `src/lib`
  (except `src/lib/teact` and `src/lib/fasterdom`, which are not ported), and build helpers (`dev/`, `plugins/`).
- **The custom GramJS** (`src/lib/gramjs`): telegram-tt's heavily modified fork of
  [GramJS](https://github.com/gram-js/gramjs) (MIT), itself a port of the Python library
  [Telethon](https://github.com/LonamiWebs/Telethon). See the table below for its notice.
- **Styles**: SCSS modules and global stylesheets (`src/styles`, `*.scss` next to components), themes
  (`src/styles/themes.json`), the icon font (`src/styles/icons.*`, built from `src/assets/font-icons`).
- **Assets**: images, SVG, animated stickers (`.tgs`), fonts, localization fallback strings (`src/assets`), and the
  static files under `public/` (icons, sounds, manifests).

## What is original to telegram-dd

The teact → frameact adaptation of every ported file, the store glue that replaces TeactN (`src/global/index.ts` in
this repository), the build and tooling configuration (Vite 8, TypeScript 7, oxlint, prettier), and the documentation
(`AGENTS.md`, `docs/`, this file). Original code is licensed GPL-3.0-or-later like the rest of the work.

Original code moved in from frameact: the UI kit in `src/lib/kit` (`Transition`, `ShowTransition`, `InfiniteScroll`,
`createScrollAnchor`, `waitForAnimationEnd`, with their tests and test helpers), moved from frameact (MIT, © 2026 Denis
Maramygin) at commit `a3c2d7d` (`src/kit`, before frameact PR #16 removed it). It is clean-room code written from
behaviour and tests, with no telegram-tt code; the files keep their provenance lines and are combined into this
GPL-3.0-or-later work like the rest of the app. The app's own DOM helper `src/util/dom/natives.ts` is original too.

## frameact: a separately licensed component

[frameact](https://github.com/denislibs/frameact) lives in `src/vendor/frameact` (a git submodule) and is licensed
under the **MIT License**, © 2026 Denis Maramygin. Its own vendored code (maverick-js/signals, teact
([Ajaxy/teact](https://github.com/Ajaxy/teact), MIT), dom-expressions, solidjs/solid: MIT; udomdiff: ISC) is listed in
`src/vendor/frameact/THIRD_PARTY_LICENSES.md`. The MIT License is compatible with the GPL: frameact is combined with
this app and conveyed under the GPL as part of the whole, while frameact itself stays MIT. **No telegram-tt code ever
enters `src/vendor/frameact`**: framework gaps are implemented clean-room in the frameact repository.

## Third-party components inside telegram-tt

Inventory of the telegram-tt tree at the baseline commit, from license files, file headers and attribution comments
(`grep` for `license`, `copyright`, `(c)`, `SPDX`, `github.com/`, `adapted`, `based on`, `ported` under `src/lib`,
`src/util`, `src/components`, `src/api`, `src/assets`, `public`). **check** marks an entry whose license or origin is not
stated in the tree and must be verified upstream before a release; nothing here is guessed silently.

### Vendored code

| Path in telegram-tt                           | Upstream                                                                                                                                           | License                                                                       | Evidence in the tree                                                                                                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/gramjs/`                             | [gram-js/gramjs](https://github.com/gram-js/gramjs), a port of [Telethon](https://github.com/LonamiWebs/Telethon); heavily modified by telegram-tt | MIT (GramJS, per telegram-tt's README); Telethon: check                       | No `LICENSE` and no per-file headers in the directory; README credit only; `network/MTProtoState.ts` refers to `telethon.*`. **TODO**: add GramJS's license text (upstream copyright line) on import. |
| `src/lib/gramjs/Utils.ts` (one function)      | Telegram Desktop ([telegramdesktop](https://github.com/telegramdesktop/))                                                                          | check                                                                         | Comment "Ported from https://github.com/telegramdesktop/"                                                                                                                                             |
| `src/lib/gramjs/Helpers.ts` (CRC32)           | Stack Overflow answer 18639999                                                                                                                     | check (Stack Overflow content license)                                        | Comment "Taken from https://stackoverflow.com/…"                                                                                                                                                      |
| `src/lib/fastBlur.js`                         | Superfast Blur v0.5, Mario Klingemann                                                                                                              | MIT, © 2011 Mario Klingemann                                                  | Full license text in the file header                                                                                                                                                                  |
| `src/lib/twemojiRegex.js`                     | [jdecked/twemoji-parser](https://github.com/jdecked/twemoji-parser), © Twitter Inc. and other contributors                                         | MIT                                                                           | File header                                                                                                                                                                                           |
| `src/lib/tlottie/tlottie*.wasm`               | [dkaraush/tlottie](https://github.com/dkaraush/tlottie) @ `92df98d`                                                                                | MIT                                                                           | `src/lib/tlottie/README.md` (with rebuild instructions)                                                                                                                                               |
| `src/lib/fasttextweb/fasttext-wasm.{js,wasm}` | [karmdesai/fastTextWeb](https://github.com/karmdesai/fastTextWeb), built from fastText                                                             | check                                                                         | Credited in telegram-tt's README without a license                                                                                                                                                    |
| `src/lib/ton/ed25519.ts` (`BigInt` fallback)  | port of [paulmillr/noble-ed25519](https://github.com/paulmillr/noble-ed25519)                                                                      | check                                                                         | File comment                                                                                                                                                                                          |
| `src/lib/ton/bip39Wordlist.ts`                | BIP-0039 English wordlist ([bitcoin/bips](https://github.com/bitcoin/bips))                                                                        | check                                                                         | File comment (URL only)                                                                                                                                                                               |
| `src/lib/punycode.js`                         | unknown                                                                                                                                            | check                                                                         | No header; looks like a third-party punycode implementation                                                                                                                                           |
| `src/lib/teact/`, `src/lib/fasterdom/`        | teact ([Ajaxy/teact](https://github.com/Ajaxy/teact) is MIT as a standalone repository)                                                            | GPL-3.0-or-later as copied into telegram-tt                                   | **Not ported**: replaced by frameact. `layoutCauses.ts` cites a Paul Irish gist                                                                                                                       |
| Other `src/lib/*`                             | telegram-tt                                                                                                                                        | GPL-3.0-or-later                                                              | No third-party notice in `color.ts`, `diamond/`, `hljs-tl/`, `latex/`, `mediaWorker/`, `offscreen-canvas/`, `ton/` (rest), `vibecalls/`                                                               |
| Code adapted per attribution comments         | Telegram Desktop, TelegramSwift, Telegram-iOS, mantine, lethargy, twallpaper-webgl, TelegramV/App, shaka-player                                    | check: whether the code was copied or only consulted, and under which license | `src/util/{colors,waveform,forumColors,map,parseHotkey,lethargy,gradientBackground}.ts`, `src/util/browser/unloadVideo.ts`, `calculateAlbumLayout.ts`, `src/api/gramjs/methods/phoneCallState.ts`     |

### Assets

| Path in telegram-tt                                                                                                                       | What                                                                                                                                                                  | License                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/assets/fonts/KFO*.woff2`, `roboto.css`                                                                                               | Roboto (Google Fonts subsets)                                                                                                                                         | check (Apache-2.0 or OFL-1.1 depending on the Roboto version)                                       |
| `src/assets/fonts/Roboto-Condensed-Regular.woff2`                                                                                         | Roboto Condensed                                                                                                                                                      | check                                                                                               |
| `src/assets/fonts/Nunito-ExtraBold.woff2`                                                                                                 | Nunito                                                                                                                                                                | check (OFL-1.1 upstream)                                                                            |
| `src/assets/fonts/Vazirmatn-NL-*.woff2`                                                                                                   | Vazirmatn                                                                                                                                                             | check (OFL-1.1 upstream)                                                                            |
| `src/assets/fonts/Numbers-Rounded.woff2`                                                                                                  | unknown                                                                                                                                                               | check                                                                                               |
| Emoji images `img-apple-64`, `img-apple-160`                                                                                              | Copied at build time by telegram-tt's `vite.config.ts` from the `emoji-data-ios` dependency ([korenskoy/emoji-data-ios](https://github.com/korenskoy/emoji-data-ios)) | emoji-data code: MIT (telegram-tt's README); the Apple emoji artwork: **check** before distributing |
| `src/assets/font-icons/*.svg` → `src/styles/icons.woff2`                                                                                  | Telegram Web A icon set, built by `dev/buildIcons.ts`                                                                                                                 | telegram-tt (GPL-3.0-or-later); artwork origin: check                                               |
| `src/assets/tgs/**`, `src/assets/tgs-previews/**`                                                                                         | Telegram animated stickers (duck, etc.)                                                                                                                               | check                                                                                               |
| `public/*.mp3`                                                                                                                            | Call and notification sounds                                                                                                                                          | check                                                                                               |
| `src/assets/models/diamond/*.bin`                                                                                                         | 3D model data                                                                                                                                                         | check                                                                                               |
| `src/styles/reboot.css`                                                                                                                   | CSS reset; the name suggests Bootstrap Reboot                                                                                                                         | check                                                                                               |
| `telegram-logo*.svg`, `visa.svg`, `mastercard.svg`, `mir.svg`, `stripe-logo.png`, `smartglocal-logo.png`, `public/icon-*.png`, `favicon*` | Logos                                                                                                                                                                 | Trademarks of their owners (see below)                                                              |

### npm dependencies used by telegram-tt

Licenses as stated in telegram-tt's README; the rest are not stated there (check against each package's `LICENSE`).
They enter telegram-dd only when added to `package.json`, and their notices travel with the packages. **TODO**: emit the
license texts of bundled dependencies into the production build (tooling to be chosen with the dependency import).

| Package                                                                                               | License (per telegram-tt's README)                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `fflate`, `emoji-data-ios` (emoji-data), `qr-code-styling`, `music-metadata`, `@tiptap/*`, `lowlight` | MIT                                                                            |
| `idb-keyval`                                                                                          | Apache-2.0 (compatible with GPL-3.0)                                           |
| `@cryptography/aes` (spalt08/cryptography)                                                            | GPL-3.0-or-later per its `package.json` (telegram-tt's README says Apache-2.0) |
| `opus-recorder` (fork `Ajaxy/opus-recorder`; its `decoderWorker.min.wasm` is copied into the build)   | "Various Licenses" (upstream `LICENSE.md`): check                              |
| `marked`                                                                                              | MIT (credited in the README; not in telegram-tt's `package.json`: check)       |
| `async-mutex`, `colorjs.io`, `lovely-chart`, `temml`, `tweetnacl`, `@tauri-apps/*`                    | not stated: check                                                              |

## Trademarks and the Telegram API

The GPL grants no trademark rights. "Telegram", the Telegram logo and the payment-provider logos belong to their owners;
telegram-dd is an unofficial client and is not affiliated with Telegram. Use of the Telegram API is subject to
Telegram's API Terms of Service (<https://core.telegram.org/api/terms>; check its naming and branding requirements
before a public release). Every build needs its own `api_id`/`api_hash` from <https://my.telegram.org>, kept in
`.env.local` and never committed.
