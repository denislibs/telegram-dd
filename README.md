# tg-frameact

A Telegram web client on [frameact](https://github.com/denislibs/frameact): Telegram Web A
([telegram-tt](https://github.com/Ajaxy/telegram-tt)) ported from teact to frameact — fine-grained signals, one DOM commit
per frame, heavy-animation gating.

> Early stage: the project skeleton. See [`AGENTS.md`](AGENTS.md) for the layout, commands and porting rules.

```bash
git clone --recurse-submodules <this repo> && cd tg-frameact
git clone --depth 1 https://github.com/Ajaxy/telegram-tt.git reference/telegram-tt
pnpm install && pnpm dev
```

License: GPL-3.0-or-later (derived from telegram-tt). The framework in `src/vendor/frameact` is MIT.
