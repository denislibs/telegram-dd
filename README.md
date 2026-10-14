# telegram-dd

A Telegram web client on [frameact](https://github.com/denislibs/frameact): Telegram Web A
([telegram-tt](https://github.com/Ajaxy/telegram-tt)) ported from teact to frameact — fine-grained signals, one DOM commit
per frame, heavy-animation gating.

> Early stage: the project skeleton. See [`AGENTS.md`](AGENTS.md) for the layout, commands and porting rules, and
> [`docs/porting-guide.md`](docs/porting-guide.md) for how telegram-tt code is ported.

```bash
git clone --recurse-submodules https://github.com/denislibs/telegram-dd.git && cd telegram-dd
git clone --depth 1 https://github.com/Ajaxy/telegram-tt.git reference/telegram-tt
pnpm install && pnpm dev
```

## Source code & GPL obligations

telegram-dd is licensed **GPL-3.0-or-later** ([`LICENSE`](LICENSE)): it is a modified version of
[telegram-tt](https://github.com/Ajaxy/telegram-tt) (© Alexander Zinchuk and contributors). Attribution, the
modification notice and the third-party inventory are in [`NOTICE.md`](NOTICE.md).

- **Corresponding source** is this repository at the commit a build was made from, including the pinned
  `src/vendor/frameact` submodule (MIT, a separately licensed component) and the build scripts and lockfile.
- **Distributing a build** (hosting the web app counts: users receive its JavaScript) requires offering that source
  under GPL-3.0 to everyone who gets the build, e.g. a link to this repository at the matching commit (§6(d)).
- **No additional restrictions** may be added (§10): builds and source carry no terms beyond GPL-3.0. Existing notices
  (MIT/Apache headers, `NOTICE.md`) must stay intact.
- **TODO (UI)**: show "GPL-3.0-or-later · Source code" next to the version in the main menu footer when porting
  `src/components/common/MainMenuDropdown.tsx` / `src/components/left/main/LeftSideMenuItems.tsx` (telegram-tt shows
  only the version there; see [`docs/porting-guide.md`](docs/porting-guide.md#71-port-order)).
