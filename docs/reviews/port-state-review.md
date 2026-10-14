# Ревью: порт слоя состояния (`port/state`, `75cd20d..HEAD`, T1–T5)

Ветка `port/state`, 7 коммитов, базовая версия tt `090e38f`. Проверено по [`reports/port-state.md`](../reports/port-state.md),
[`store-architecture.md`](../store-architecture.md) §1.2, §10, §12 и по эталону `reference/telegram-tt` (только чтение).

## Вердикт: FIXES NEEDED (Critical нет, 2 Important)

Сам порт сделан аккуратно. 493 из 545 файлов совпадают с tt байт в байт, 22 отличаются только импортами (я
просмотрел их все). Правки в коде из этого диапазона минимальны, у каждой стоит пометка `// Deviation:`, и все
перечислены в §12. Glue (`global/index.ts`) корректен, guard `mapperDepth` действительно проверен мутацией. Блокеров
два, и оба не в слое tt. Первый: генератор случайных чисел в property-тестах вырожден, поэтому «случайный» прогон по
настоящим reducers почти всё время работает с одним чатом и одним сообщением. Сломанное сравнение массивов в walk он
не ловит (проверено мутацией). Второй: `actions/all` грузится через `await` до `establishMultitabRole` и до первого
render. У tt порядок другой, а заявлено «как Main.tsx».

### Что запускал (HEAD `2613c9d`)

| Команда                            | Результат                                                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                       | зелёный (lint, prettier, tsc, gates diff/tests/licenses, build, size)                                           |
| `pnpm test`                        | 24 файла, 260 passed, 2 skipped (opt-in бенчи)                                                                  |
| `pnpm gates`                       | diff/tests/licenses/size pass, upstream reported                                                                |
| `pnpm test:e2e`                    | 8 passed; дополнительно `multitab.spec.ts --repeat-each=3`: 3/3 стабильно                                       |
| мутация `mapperDepth = 0` удалена  | `index.test.ts` падает (1 тест), заявление отчёта подтверждено                                                  |
| мутация `areArraysShallowEqual`    | массивы одной длины считаются равными: **`reducers.test.ts`, `cache.test.ts`, `messages.test.ts` зелёные** (I1) |
| та же мутация + mulberry32 в тесте | `reducers.test.ts` падает на `.chats.listIds.active.1: "101" vs "10…"`                                          |
| мутация «не удалять ключи»         | `reducers.test.ts` падает (удаления покрыты)                                                                    |
| `@ts-expect-error` вернул в bots   | `tsc` 7.0.2: `TS2578 Unused '@ts-expect-error'` в `bots.ts:162`, обоснование отклонения верно                   |

## Important

### I1. Property-тесты на вырожденном PRNG: «случайная» последовательность почти всегда про чат `100` и сообщение 1

`src/global/store/reducers.test.ts:73` (новый T1-тест), и так же `src/global/store/apply.test.ts:418` (M3 из
design-ревью, вне диапазона, но на нём держится утверждение «M3 исправлено»):

```ts
seed = (seed * 1103515245 + 12345) & 0x7fffffff;
return seed % n;
```

`seed * 1103515245` достигает ~2.4·10¹⁸, это больше 2⁵³, и младшие биты теряются ещё до маски. Результат: `rnd(4)`
и `rnd(8)` в 99,3 % вызовов дают `0` (seed 7 и 20261014: `{0: 2980, 1: 20}` на 3000 вызовов). В T1-тесте поэтому
`chatId` почти всегда `'100'`, а `messageId` почти всегда `1`. `replaceTabThreadParam` всегда пишет `[1, 2]`, у
`replaceChatListIds` всего 3 варианта, и ни один шаг не заменяет массив другим массивом той же длины.

Сценарий: в `apply.ts` сломано сравнение массивов (`areArraysShallowEqual` возвращает `true` при равной длине, то
есть `listIds`/`viewportIds` той же длины в зеркало не попадают). Все три новых теста остаются зелёными: property,
cache round trip, `apiUpdate newMessage`. С нормальным PRNG тот же property-тест падает на первой же такой замене.
Заявление отчёта «property test over real reducers» сейчас фактически означает один детерминированный сценарий.

Fix: `mulberry32` или `seed = (Math.imul(seed, 1103515245) + 12345) >>> 0` и брать старшие биты
(`(seed >>> 16) % n`). Это нужно в обоих файлах. В конце раунда добавить проверку покрытия, чтобы тест не мог снова
тихо выродиться: затронуто ≥ 3 чатов и ≥ 4 id сообщений, есть ≥ 1 замена массива той же длины и ≥ 1 удаление. Повторить
мутации из таблицы выше. Если M3 с новым PRNG покажет расхождение, это уже находка по walk.

### I2. `src/index.tsx:70`: `await import('./global/actions/all')` блокирует роль и первый render. Порядок tt не такой

В tt `actions/all` импортирует `components/main/Main.tsx`. Он лежит в бандле `Main`, а его грузит `UiLoader`
(`loadRequiredBundle`) **после первого render** и только для страниц `main`/`lock`. В `init()` у tt между
`getActions().init()` и `establishMultitabRole` нет ни одного `await`. Здесь там стоит загрузка ленивого чанка
`all.js` (91 KiB brotli).

- Первый render и `establishMultitabRole` (строки 86, 95) ждут сетевой загрузки и разбора `all.js`. Это прямая
  задержка cold start, которой у tt нет.
- Если чанк не загрузился (флап сети, деплой поменял hash), `init()` отклоняется и экран остаётся пустым. У tt в
  такой ситуации всё равно рендерится экран входа.
- На экране входа (сессии нет) регистрируются все ~1000 обработчиков и их `addCallback`. У tt их до логина нет.

Гонки с ролью multitab я не нашёл: `establishMultitabRole` подписывает `handleMessage` только при вызове, так что
сообщение о смерти master во время `await` не теряется. Восстановление кэша (`initGlobal`) завершается до `await`.
Позднее появление `api/sync.ts` безопасно: при `previousGlobal === undefined` его callback сам вызовет `sync()`.
Отчёт и §12 описывают этот шаг как «as `Main.tsx` does / tt order kept», и это неточно.

Fix (3 строки, ближе к tt): `subscribeToMasterChange`, затем `establishMultitabRole`, затем
`requestMutation(render)`, и уже после них `void import('./global/actions/all').catch(handleError)`. Это время
эффекта `UiLoader`. Комментарий «after the tab state exists» при таком порядке остаётся верным. Если нужна ранняя
загрузка, запускать `import()` параллельно и не ждать его до render. В отчёте и §12 исправить формулировку.

## Minor

| #   | Где                                                                                                                                                     | Что и сценарий                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Fix                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| m1  | `scripts/gates/diff-allowlist.json:6`                                                                                                                   | `pnpm gates:diff` выводит «Stale allowlist entries: `src/index.tsx`» (36,9 % < 40 %). В отчёте сказано, что удалена устаревшая запись `reducers/index.ts`, а эта осталась                                                                                                                                                                                                                                                                                                                         | удалить запись                                                                                                               |
| m2  | `tests/e2e/multitab.spec.ts:27,69,82`                                                                                                                   | e2e читает только committed global (`window.getGlobal`) и **ни разу не читает зеркало store во вкладке B**. Если walk в B сломан, а компоненты будут читать именно зеркало, тест пройдёт. Эхо и транспорт проверены хорошо (контроль «B всё-таки отправляет» есть)                                                                                                                                                                                                                                | DEV `window.getMirror = () => unwrap(useGlobal())`, проверить `getMirror().chats.byId['777001'].title` в B и `byTabId[tabA]` |
| m3  | `scripts/gates/size-budget.json`                                                                                                                        | У `assets/all.js` нет своего бюджета, он входит только в `TOTAL js`. Именно этот чанк будет расти в T6                                                                                                                                                                                                                                                                                                                                                                                            | отдельная запись `assets/all.js` (baseline 90,6 KiB)                                                                         |
| m4  | `util/notifications.tsx` (stub) → `actions/api/settings.ts:403`                                                                                         | `requestPermission()` всегда возвращает `false`, поэтому `updateWebNotificationSettings` **записывает** `hasWebNotifications: false`, а это значение уходит в кэш и в multitab. У tt при выданном разрешении так не бывает. Сейчас из UI недостижимо                                                                                                                                                                                                                                              | в список блокеров T6 (до порта экрана настроек), либо stub `requestPermission` → `Notification.requestPermission()`          |
| m5  | `util/localization/index.ts:11` (stub)                                                                                                                  | `getTranslationFn()` возвращает сам ключ, и этот ключ **уходит наружу**: заголовок темы bot-forum `'BotForumTopi...'` (`actions/api/messages.ts:700`, сообщение без текста) и имя passkey `'PasscodePasskeyName'` (`util/passcode/passkey.ts:29`, сохраняется в хранилище ОС). У `LangFn`-stub нет `conjunction`/`disjunction`/`with`/`withRegular`/`region`/`currency`/`code`/`timeFormat`, так что `helpers/messages.ts:597` бросит `TypeError` там, где должна быть строка. Сейчас недостижимо | дописать в stub все члены `LangFn` (без исключений) и внести обе утечки в блокеры T6 (композер, passcode)                    |
| m6  | `tests/e2e/strictMonitor.spec.ts:45`                                                                                                                    | Тест принимает `console.error` вместо `pageerror`, и это оправдано: `handleError` из tt делает `preventDefault()`. Но ветку `pageerror` в мониторе теперь не проверяет ни один spec                                                                                                                                                                                                                                                                                                               | отдельный тест на странице без entry (`page.setContent`) или `throw` в `setTimeout` до загрузки `handleError`                |
| m7  | `store-architecture.md` §12, таблица отклонений                                                                                                         | Таблица заявлена как полная, но в ней нет `hooks/data/useSelector.ts`: переписан на 79 %, в allowlist есть, пометки `// Deviation:` нет. Файл из прошлого диапазона, но относится к слою состояния                                                                                                                                                                                                                                                                                                | добавить строку                                                                                                              |
| m8  | `useAppLayout.ts` (stub), последняя строка                                                                                                              | Экспортирует `appLayoutCallbacks`, `isLandscape`, `isTouchScreen`, которых у tt нет. Последние два экспортируются как live binding `let`                                                                                                                                                                                                                                                                                                                                                          | убрать при порте хука в T6, сейчас никто их не импортирует                                                                   |
| m9  | `actions/api/sync.ts:15`, `ui/initial.ts:24`, `ui/misc.ts:23`, `ui/settings.ts:17`, `intervals.ts:8`, `folderManager.ts:2`, `sharedStateConnector.ts:7` | Переписчик импортов выдаёт `addCallback,getActions` без пробела (файлы в `.prettierignore`). Поведение не меняется, но получается лишний шум при сверке с upstream                                                                                                                                                                                                                                                                                                                                | поправить шаблон в codemod                                                                                                   |

## Ответы по пунктам задачи

### 1. Дословность: 17 файлов с правками в коде и 8 мест `// Deviation:`

Из 17 файлов к этому диапазону относятся 7: `global/index.ts`, `hooks/useFolderManager.ts`, `index.tsx`,
`selectors/audioPlayer.ts`, `apiUpdaters/users.ts`, `api/stories.ts`, `ui/bots.ts`. Остальные (`App.tsx`,
`MessageListHistoryHandler.tsx`, `useSelector.ts`, `useHistoryBack.ts`, `memoized.ts`, `@types/global.d.ts`, `ui/Spinner`,
`Loading`, `RippleEffect`, `Link`) взяты из foundation/design. Diff с tt построчно:

| Файл                           | Нужна? Минимальна? Обоснование верно?                                                                                                                                                                                                                                                                                                                                                                                                                                                      | В §12        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `api/stories.ts` (4 места)     | Да. Семантика сохранена: условие `while (global.stories.hasNext)` читает локальную `global`, а после spread в ней то же значение, что tt получал мутацией. Ветка без `peerStories` (только `stateHash`) тоже эквивалентна                                                                                                                                                                                                                                                                  | да           |
| `apiUpdaters/users.ts`         | Да, одна строка. **Семантика та же**: у tt `throttleWithFullyIdle(fn) = throttleWith(onFullyIdle, fn)` (`lib/teact/heavyAnimation.ts`), и `throttleWith` у frameact и tt совпадает построчно. Разница только внутри `onFullyIdle`: tt во время анимации опрашивает через `requestMeasure`, frameact ждёт `isAnimating.once` корневого scope. Вызов, задержка и порядок `onIdle` те же. Можно было обойтись без отклонения через compat-модуль `lib/teact/heavyAnimation`, но строка короче | да           |
| `ui/bots.ts`                   | Да. Проверил: под tsc 7.0.2 `@ts-expect-error` даёт TS2578 (у tt TS 6). Побочный эффект: `@ts-ignore` скроет и будущую настоящую ошибку в этом вызове. Перепроверять при каждом обновлении TS                                                                                                                                                                                                                                                                                              | да           |
| `selectors/audioPlayer.ts` (2) | Да (N2). Если `searchParams`/`keys` не proxy, поведение байт в байт как у tt, включая `WeakMap.set` на не-объекте                                                                                                                                                                                                                                                                                                                                                                          | да           |
| `util/memoized.ts` (1)         | из прошлого диапазона, без изменений                                                                                                                                                                                                                                                                                                                                                                                                                                                       | да           |
| `hooks/useFolderManager.ts`    | Да (T4). Accessor плюс `equals: false` соответствует `forceUpdate` у tt. Смена `folderId` переподписывается через `createEffect` с возвратом cleanup                                                                                                                                                                                                                                                                                                                                       | да           |
| `global/index.ts`              | glue, см. п. 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | да           |
| `src/index.tsx`                | см. п. 3 и I2                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | под таблицей |

Файлы, где отличаются только импорты (22): замены `teactn` → `../global`, `fasterdom`/`heavyAnimation`/`teact` →
`frameact`, `TeactNode` → `lib/frameactNode`, `setExtraStyles` → `frameact/dom`. Скрытых изменений поведения нет.
`getIsHeavyAnimating` у frameact вызывается как `(): boolean` (`OnceSignal`), `cache.ts:472` работает так же.
`onFullyIdle` в `cache.ts`, `multitab.ts`, `folderManager.ts`, `url.ts` разобран выше.

### 2. Полнота замыкания: 13 FOUNDATION STUB

| Stub                                                                                              | Влияние на runtime портированных actions                                                                                                                                                                                                                                                                     | Горячий / важный для корректности путь?       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `util/notifications.tsx`                                                                          | `notifyAboutMessage` на каждом `newMessage` ничего не делает (горячий, но без состояния). `subscribe` не регистрирует push. **`requestPermission → false` пишет состояние** (m4)                                                                                                                             | горячий, без вреда; m4 влияет на корректность |
| `util/localization/index.ts`                                                                      | Тексты toast/notification состоят из ключей. **Ключ уходит на сервер и в ОС** (m5). При неполном `LangFn` вместо строки будет `TypeError`. `initLocalization`/`changeLanguage` ничего не делают, язык не применяется                                                                                         | m5                                            |
| `util/localization/format.tsx`                                                                    | `*AsIcon` возвращает текст (ключ). Только отображение                                                                                                                                                                                                                                                        | нет                                           |
| `util/moduleLoader.ts`                                                                            | `copyMessages` (`ui/messages.ts:1149`): `{}.buildMessageCopyContent` отклоняет промис, `copyTextToClipboardFromPromise` показывает `GeneralError`. Это заметная деградация, но не падение. `requestMasterAndCallAction` (`init.ts:153`): обработчики Calls регистрирует `all.ts`, так что поведение как у tt | нет                                           |
| `renderMessageText.ts`, `renderTextWithEntities.tsx`, `renderText.tsx`                            | Сводки сообщений в виде простого текста. Потребители (уведомления, UI) сами пока stub'ы                                                                                                                                                                                                                      | нет                                           |
| `hooks/useAppLayout.ts`                                                                           | `getIsMobile`/`getIsTablet` и media queries взяты из tt дословно, без потерь                                                                                                                                                                                                                                 | нет                                           |
| `useOldLang.ts`, `useReducer.ts`, `useFoldersReducer.ts`, `parseCheckList.ts`, `PaymentModal.tsx` | только типы, и `global/**` использует их только как типы (проверено grep)                                                                                                                                                                                                                                    | нет                                           |

Мест, где stub молча возвращает `undefined` вместо данных, которые tt положил бы в global, на путях, достижимых без
UI, нет. Есть два исключения, которые пишут неверные данные (m4, m5). Оба недостижимы, пока нет компонентов, и
должны стоять в списке блокеров T6.

### 3. Порядок загрузки (`src/index.tsx`)

Порядок модулей при загрузке совпадает с tt. `actions/initial` вычисляется сразу после `global/init`, у tt он идёт
последним через `App → Auth`, но оба раньше `init()`, так что для callbacks разницы нет. Последовательность внутри
`init()` повторяет tt до `getActions().init()`. Пропущенные шаги помечены `TODO(port)`: `checkAndAssignPermanentWebVersion`,
`listenOtherClients`, `initAutolock`, `updateWebmanifest`, `betterView`, SW, tauri. Отличается одно: `await import(all)`
(I2). Гонок с ролью multitab и с восстановлением кэша нет, разбор в I2. `loadPasscodeActions` теперь ждёт `all`
через `initializationPromise`, и actions из passcode зарегистрированы так же, как после загрузки `Main` у tt.

### 4. Glue

`apply.ts` в этом диапазоне не менялся. В `global/index.ts` три изменения. Первое: `__globalDiffLog` под
`DEBUG_MORE` (ring buffer на 100, `deepDiff` между соседними запусками callbacks), корректен. Второе: DEV-доступ
`window.getGlobal/setGlobal/getActions`, как у tt. Третье: guard `mapperDepth` в `runHandlers`. В нём контекст
сбрасывается на время синхронной части всех обработчиков с этим именем и восстанавливается в `finally`, в DEV
пишется ошибка. Async-продолжения и так выполняются вне mapper. Тест проверяет, что обработчик получил plain-копию,
в committed нет объектов store, а mapper не подписан на корень. Мутация его роняет. Регрессий относительно C1/C2/I1–I6
и N1–N4 из design-ревью не нашёл: все прежние тесты (`index.test.ts`, `apply.test.ts`, `memoized.test.ts`,
`withGlobal.types.ts`) зелёные. Оговорка: M3 из `apply.test.ts` слабее, чем считалось (I1).

### 5. Тесты

- `store/reducers.test.ts`: идея правильная (настоящие reducers, сверка зеркала с committed по JSON после каждого
  шага, неизменность снимков), но из-за PRNG тест вырожден (I1). Удаления ключей ловит, массивы той же длины не ловит.
- `apiUpdaters/messages.test.ts`: хороший. Настоящий `apiUpdate newMessage` через `actions/all`, проверены зеркало,
  `listedIds`, ровно 1 повторный запуск строки 100, 0 повторных у строки 200, равенство зеркала и неизменность снимка.
  Сломанную гранулярность или сломанную запись сущности он поймает. Подмену массива той же длины не поймает,
  потому что `listedIds` растёт.
- `cache.test.ts`: настоящий путь `setupCaching → callback → throttle 5 s → onFullyIdle → IDB → loadCache → setGlobal`.
  Запись `'300'` после `setupCaching` доказывает, что сработал именно callback. Плюс vault для passcode и случай
  «кэш выключен». Сломанный кэш поймает.
- `consumers.test.ts`: настоящие модули (`ui/settings`, `intervals`, `sharedStateConnector`, `folderManager` и хук,
  `customEmojiManager`). Именно эти места сломались бы при «живом корне» (C2), так что тест полезный.
- `multitab.spec.ts`: эхо проверено честно, есть контроль, что B вообще отправляет, проверены и чат, и чужое
  состояние вкладки. Пробел: зеркало store не проверяется (m2).
- `mutationGuard.test.ts`: шаблон стал шире (составное присваивание, `delete`, скобки, мутирующие методы), safe-list
  с проверкой, что записи не устаревают. В `src/global`/`src/util` grep пропущенных форм (`global.a[k].b =`,
  `Object.assign(global.x…)`) ничего не нашёл.

### 6. Бандл и разбиение на чанки по сравнению с tt

У tt нет `manualChunks`, чанки задаются динамическими импортами бандлов (`moduleLoader`). Сверил с
`reference/telegram-tt/dist`. `switchMultitabRole` и `updateShouldEnableDebugLog` (это `actions/initial`) лежат в
`index-*.js`, остальные обработчики в `main-*.js` (бандл `Main`). Начальный JS у tt: `index` 40,7 KiB плюс 24
modulepreload, всего ≈ 221 KiB brotli (вместе с teact и UI). GramJS worker у tt весит 203,2 KiB brotli
(`worker-*.js`), у нас 203,2 KiB. **Граница разбиения повторяет tt**: `actions/initial` и замыкание до логина в entry,
`actions/all` в ленивом чанке. Наш `index.js` на 101 KiB содержит frameact, слой состояния до логина, reducers,
selectors, helpers и API connector, и одного файла здесь достаточно. Рост бюджетов обоснован. Два замечания: `all.js`
не имеет отдельного бюджета (m3), и грузится он раньше, чем `main` у tt (I2).

## Порядок исправлений

1. I1: PRNG в `reducers.test.ts` и `apply.test.ts`, проверка покрытия, повторить мутации.
2. I2: `actions/all` после роли и render, `catch`. Поправить формулировку в отчёте и §12.
3. m1, m3 (gates), m2 (зеркало в e2e), m5 (полный `LangFn`-stub). Остальное по ходу T6.
