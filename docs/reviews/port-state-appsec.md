# AppSec-ревью слоя состояния (`port/state`, `75cd20d..HEAD` + glue `src/global/index.ts`, `src/global/store/apply.ts`)

Инструмент: скилл `appsec-review` (frameact). Эталон: `reference/telegram-tt` (tt@090e38f). Все PoC — vitest в
одноразовой папке `src/__appsec_poc__/` внутри worktree, удалены после прогона (в коммит не попали).

Модель угроз. Недоверенные данные попадают в стор тремя путями: (1) восстановление кэша (IndexedDB / localStorage):
писать туда может только тот же origin — вредоносное расширение, XSS в другом месте приложения, повреждённая БД, старая
схема; (2) multitab (BroadcastChannel): сообщения от вкладок того же origin; (3) апдейты API: данные контролирует сервер
Telegram и, через содержимое, другие пользователи (имена, тексты, опции опросов). Важно: тот, кто может писать в IDB или
BroadcastChannel, уже имеет полный доступ к origin (сессия, ключи, `callApi` через мастер-вкладку), поэтому находки по
путям (1)–(2) — это устойчивость и defence-in-depth, а не повышение привилегий.

## Итог

Блокирующих уязвимостей нет. Сквозная проверка подтверждает: ни один из трёх путей не загрязняет `Object.prototype` —
own-ключ `__proto__` (из `JSON.parse` / structured clone) отбрасывается и в `applyContainer`/`copyContainer`, и в
`adopt`/`setProperty` стора; ключи с сервера, которые идут в `byId`, — числовые строки из bigint (`buildApiPeerId`).
Найдены дефекты glue, которые дают расхождение mirror ↔ committed global или падение `setGlobal` на испорченных данных:
неверный учёт унаследованных имён ключей (`constructor`, `toString`, …) пропускает удаление, рекурсия без ограничения
глубины/циклов в `copyContainer`, неатомарный `setGlobal`, общий изменяемый target у прокси `withGlobal`. Всё это
Low/Medium; стоит исправить до того, как через glue пойдёт живой трафик.

## Находки

1. **[Medium] Унаследованные имена ключей ломают счётчик `present` → удаление пропускается, mirror показывает удалённую запись** — `src/global/store/apply.ts:200-207`, `:235`
   - Суть: `let has = pv !== undefined` берёт `prev[key]` через цепочку прототипов. Для ключа `constructor`,
     `toString`, `hasOwnProperty`, `valueOf`, `isPrototypeOf`, … которого в `prev` нет, `pv` — функция из
     `Object.prototype`, `has = true`, `present++`. Если в том же `setGlobal` из контейнера удалён другой ключ, то
     `present === Object.keys(prev).length` и цикл удаления (`:235`) не запускается.
   - Сценарий: `byId = { a, b }` → `{ b, constructor: {...} }` одним `setGlobal`. Committed global без `a`, а
     `useGlobal().users.byId.a` по-прежнему отдаёт старый объект. В UI остаётся удалённое сообщение / отозванная
     сессия / вышедший из чата пользователь, пока соседнее изменение не перезапишет этот контейнер или не будет reload.
   - PoC (`apply.poc.test.ts › P1`): все четыре ключа воспроизводятся на реальном `createStore` + `applyGlobal`:
     `Object.hasOwn(committed.users.byId, 'a') === false`, `Object.hasOwn(mirror.users.byId, 'a') === true`.
   - Эксплуатируемо сейчас: из сети практически нет — id из MTProto числовые; строковые словари (`inlineBots.byUsername`,
     `emojiKeywords[lang]`, `translations…byLangCode`, `wallet.resolvedAddresses`) получают такие имена только от
     локального пользователя или из подделанного кэша / multitab. Внесено glue (в tt mirror'а нет).
   - Impact: устаревшие данные в UI, расхождение стора с committed global; по безопасности это значит «удалённое не
     исчезает».
   - Как исправить: считать только собственные ключи. Дёшево и точно, потому что все члены `Object.prototype` кроме
     `__proto__` (его уже отсекли) — функции, а функций в глобале tt нет:
     `let has = pv !== undefined && typeof pv !== 'function'; if (!has) { has = Object.hasOwn(prev, key); pv = has ? prev[key] : undefined; }`.
     Добавить регрессионный тест с `constructor`/`toString`.

2. **[Low] `copyContainer`/`applyContainer` рекурсивны без ограничения глубины и без защиты от циклов → `setGlobal` бросает на испорченном кэше** — `src/global/store/apply.ts:146-162`, `:186-247`
   - Сценарий: подделанная запись IDB (structured clone сохраняет циклы) или localStorage-JSON с вложенностью ~10k
     уровней в любом id-less объекте. При холодном старте `setGlobal(cache)` → `copyContainer` уходит в рекурсию.
   - PoC (`P4`): цикл `settings.x.self = settings` → исключение из `applyGlobal` (переполнение стека проявляется как
     `TypeError: undefined is not a function`); JSON-вложенность 5000 проходит, 10000 падает. `JSON.parse` у V8
     итеративный и сам выдерживает 50k, так что падает именно walk.
   - Эксплуатируемо сейчас: только при записи в IDB/localStorage. Внесено glue: tt на `setGlobal` ничего не обходит,
     поэтому такой кэш у него переживает загрузку, если эту ветку не читает код. Стор frameact (`adopt`) — итеративный,
     с `seen`, ему циклы не страшны.
   - Impact: загрузка не доходит до render (`init()` в `src/index.tsx` без `catch`); с IDB это повторяется на каждом
     reload, пока не очистят storage. Локальный кэш одноразовый: `readCache` удаляет ключ до разбора.
   - Как исправить: обходить итеративно (явный стек) или ограничить глубину (например 64: глубже tt-глобала не бывает) и
     вести `WeakSet` посещённых для `copyContainer`; при превышении — `handleError` и запись значения целиком (как entity).

3. **[Low] `setGlobal` неатомарен: `currentGlobal` присваивается до `applyGlobal`; исключение в walk оставляет mirror частично применённым навсегда** — `src/global/index.ts:214-218`
   - Сценарий: любое исключение внутри `applyGlobal` (находка 2, замороженный объект в `sanitize`, `TypeError` стора на
     пути без контейнера при уже разошедшемся mirror) → committed global уже новый, mirror обновлён до места падения.
     Следующие `setGlobal` считают diff от нового committed: недописанные ветки (`===`) больше не обходятся и в mirror
     не попадут никогда.
   - Эксплуатируемо сейчас: как следствие находок 1–2; само по себе не триггерится. Внесено glue.
   - Как исправить: `try { apply() } catch (e) { handleError(e); resync() }`, где `resync` переводит mirror в полное
     соответствие committed (например `applyGlobal(setState, unwrap(trackedGlobal), newGlobal)` по копии или
     `reconcile`), так что падение walk лечит себя, а не копит расхождение.

4. **[Low] Разреженный массив из structured clone замораживает main thread на холодном старте** — `src/global/store/apply.ts:91-100` (`sanitize`), `:174-180`
   - Сценарий: подделанная запись IDB или multitab-diff (`deepMerge` отдаёт массив как есть) содержит `[]` с
     `length = 2**32-1` в любом пути глобала, даже не используемом в UI. `sanitize` идёт `for (i < length)` по дыркам.
   - PoC (`sparse.poc.test.ts`): `length = 1e8` → `applyGlobal` 2.0 s; для `2**32-1` линейная экстраполяция ≈ 86 s
     блокировки на каждом старте.
   - Эксплуатируемо сейчас: только при записи в IDB/BroadcastChannel. Сам класс «подделанный кэш вешает клиент» в tt
     уже есть (любой массив, который tt итерирует), но glue делает триггером **любой** массив глобала.
   - Как исправить: в `sanitize` идти по массиву только при `Object.keys(raw).length === raw.length` или ограничить
     длину (сотни тысяч), а аномальный массив считать значением без обхода. То же для `areArraysShallowEqual`.

5. **[Low] Общий изменяемый target у прокси `withGlobal`: запись в props одного компонента видна другим** — `src/global/index.ts:307`, `:332`, `:354`
   - Суть: все прокси создаются над одним `EMPTY_PROPS` без ловушки `set`/`defineProperty`. `props.x = v` проходит по
     умолчанию до target, то есть пишет в общий `EMPTY_PROPS`. Тот же объект — начальное `last`, и его возвращает
     `mapped()` у неактивного (`activationFn` → false) или упавшего на первом запуске контейнера.
   - PoC (`index.poc.test.ts`): два неактивных `withGlobal`; `a.leaked = 'from A'` → `b.leaked === 'from A'`.
   - Эксплуатируемо сейчас: только при компонентном коде, который мутирует props (в tt такое — баг, но локальный для
     одного объекта). Внесено glue. Это утечка состояния между компонентами, а не XSS.
   - Как исправить: `Object.freeze(EMPTY_PROPS)` и отдельный замороженный target на прокси (или ловушки
     `set`/`defineProperty`/`deleteProperty`, которые бросают в DEV и возвращают `false` в prod).

6. **[Low, tt pre-existing] Повреждённый/старый кэш роняет загрузку навсегда** — `src/global/cache.ts:165`, `:224`; `src/index.tsx:42-66`
   - `migrateCache` обёрнут в `try/catch`, а `cached?.sharedState.settings.themes` (`:224`) и `cache.passcode.hasPasscode`
     (`:165`) нет. PoC (`cache.poc.test.ts`): в IDB лежит `{}` → `loadCache` бросает
     `Cannot read properties of undefined (reading 'settings')`, а `init()` не ловит ошибку → белый экран на каждом reload.
     Это поведение tt, файлы совпадают с эталоном (кроме импортов).
   - Как исправить (вне порта, но дёшево): в `initGlobal`/`loadCache` при исключении вызвать `removeGlobalFromCache()`
     и стартовать с `initial` (кэш всего лишь «head start», сервер его заменит).

7. **[Info, pre-existing] Multitab: own `__proto__` в diff подменяет прототип локального объекта (без глобального загрязнения)** — `src/util/deepMerge.ts:33`, `:48`; `src/util/browser/multitab.ts:220-231`
   - `acc[key] = deepMerge(...)` с `key === '__proto__'` (structured clone сохраняет own-ключ) вызывает сеттер, и
     прототип нового `acc` становится объектом атакующего. PoC (`P3`, `index.poc.test.ts`): `({}).injected === undefined`,
     но `merged.settings.byKey.injected === 'x'` (унаследовано), а прототип `getGlobal().byTabId` ≠ `Object.prototype`.
     Стор такое не копирует (spread берёт только own) → mirror ≠ committed.
   - То же в `init.ts:90-105` (`acc[key] = t` по ключам `threadsById` из кэша) и в `buildCollectionByKey` по
     `resultByOption` опросов (`option` — байты, их выбирает автор опроса; это api-слой вне диапазона, а `postMessage`
     из воркера прототип не переносит).
   - Почему Info: отправитель same-origin и так может прислать любые данные; повысить права через это нельзя.
     Hardening: в `deepMerge`/`reduceDiff` пропускать `__proto__` (`if (key === '__proto__') return acc;`), а сообщения
     BroadcastChannel валидировать по `type` и форме. Сейчас `globalDiffUpdate` с `diff = []` превращает глобал в
     массив (так и в tt).

8. **[Info] `adopt()` стора пишет в объекты tt** — `src/vendor/frameact/src/store/store.ts:381-410`
   - При записи entity по ссылке `adopt` обходит её вглубь и **в committed-объекте tt** удаляет own `__proto__` и заменяет
     вложенные прокси на raw (PoC `P2`: после `setGlobal` у `cached.chats.byId['1'].x` больше нет own `__proto__`). Для
     безопасности это скорее плюс, но расходится с инвариантом из `docs/store-architecture.md` («стор никогда не пишет
     в объекты tt»). Замороженная entity с own `__proto__` уронила бы walk (`delete` в strict mode) — это путь к
     находке 3. Задокументировать.

9. **[Info, pre-existing] Ошибки в колбэках стора / tick-end** — `src/global/index.ts:105`, `src/util/schedulers.ts:156-160`
   - `callbacks.forEach` без `try`: брошенный колбэк пропускает следующие за ним в этом тике (PoC: 0 из 1 выполнились) —
     кэш и multitab-рассылка на этот тик теряются; throttle не залипает (`waiting=false` до вызова). `onTickEnd` так же
     теряет хвост очереди. Совпадает с tt. Действия в glue устойчивее tt: исключение обработчика ловит очередь frameact
     (`report`, очередь продолжается; PoC: `actions['__proto__']()` из `requestMasterAndCallAction`-подобного вызова →
     ошибка в лог, следующее действие выполнилось). В tt исключение улетало вызывающему.
   - Hardening: `try/catch` + `handleError` на каждый колбэк.

10. **[Info] DEV-код в prod** — `src/global/index.ts:82`, `:128-139`, `:179-186`, `:206-212`, `:369-373`; `src/config.ts:26`
    - `DEBUG = APP_ENV !== 'production'`; в `vite.config.ts:22` по умолчанию `production` для `vite build` → в prod нет
      `window.getGlobal/setGlobal/getActions`, DEBUG-штампов, `throw 'outdated global'`, devScan. Но сборки с
      `APP_ENV=staging`/`perf` — DEBUG: `window.setGlobal` открыт, `handleError` показывает `alert` (раз в 1.5 s
      блокирует поток, если маппер падает на каждом проходе). Так же в tt. `__globalDiffLog` за константой
      `DEBUG_MORE = false`. `benchState.ts` импортируют только тесты. `enableStrict()` под `import.meta.env.DEV`.

Проверено и чисто:
- `__proto__` насквозь (`JSON.parse`-кэш с `__proto__` в корне, в контейнере и внутри entity → `setGlobal` из
  `src/global/index.ts`): `Object.prototype` чист, прототип корня mirror'а — `Object.prototype`, `useGlobal().rootPolluted`
  undefined. `copyContainer`/`detach` пропускают ключ, но spread оставляет его own, и его снимает `adopt`.
  `setProperty`/`descend`/`checkKey` стора дополнительно закрывают сеттер `__proto__` и нестроковые ключи.
- Апдейты API: id сущностей — `bigint.toString()` (`buildApiPeerId`), `__proto__`/`constructor` как id недостижимы;
  reducers используют computed keys в литералах (`{ ...byId, [id]: x }` создаёт own-свойство, а не прототип).
  Массивы пишутся целиком по ссылке, setState по индексу glue не делает, так что дырки/индексы за длиной стор не трогают.
- Размер: 200k users + 200k id-less статусов (24 MB JSON) — `JSON.parse` 1164 ms, `applyGlobal` 484 ms, линейно,
  без усиления (`P5`).
- Эхо multitab: получатель ставит `currentGlobal = global` до `setGlobal`, колбэк получает тот же объект → без
  повторной рассылки (как в tt).
- Логи: `[frameact/store] action "<name>" failed` и сообщения glue содержат имя действия / путь из id, текстов нет.

## Зависимости и supply chain

`package.json`/`pnpm-lock.yaml` в диапазоне не менялись. `pnpm audit --prod`: «No known vulnerabilities found».
frameact подключён как workspace-пакет из сабмодуля `src/vendor/frameact` (40bafb6).

## Рекомендации для следующих слоёв

- Компоненты, которые будут читать `useGlobal()`, должны выдерживать отсутствие сущности по id, который лежит в списке
  (`listIds` содержит `'__proto__'`, а стор его не хранит): `chat!.title` в рендере = исключение. Поддерживать вариант
  с `undefined`.
- Перед включением живого кэша: находки 1–3 (атомарность + итеративный walk + own-ключи) и fallback «сбросить кэш при
  ошибке загрузки» (6).
- Валидация сообщений BroadcastChannel по схеме (`type` + форма payload) — дёшево и закрывает класс «malformed
  message роняет лидера».

## Вердикт

Мерж не блокируется: ни один путь не даёт загрязнения прототипов или выполнения кода. До боевого трафика исправить в
glue: (1) учёт own-ключей в `applyContainer` — реальный баг устаревших данных; (2)–(3) итеративный/ограниченный walk и
самовосстановление `setGlobal` при исключении; (5) заморозить `EMPTY_PROPS`. Остальное — hardening и поведение tt.
