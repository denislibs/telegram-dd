# Ревью: auth-слайс (`port/auth`), поведенческая верность tt и идиомы frameact

Ветка `port/auth`, диапазон `origin/main..HEAD` без merge-коммитов из main (HEAD `f6de86d`, код проверялся на
`ffa7e37`; `f6de86d` добавляет только `slice-auth-appsec.md`). Базовая версия tt `090e38f`. Сверял с
[`reports/slice-auth.md`](../reports/slice-auth.md), `AGENTS.md`, [`porting-guide.md`](../porting-guide.md) §4,
[`codemod.md`](../codemod.md), `store-architecture.md` §12, framework guide (`porting-from-teact.md`), `llms-full.md` и с
эталоном `reference/telegram-tt` (только чтение). Каждый экран auth сравнивал с tt построчно (`diff -u`), UI-компоненты и
хуки слайса тоже. Всё, что называю ошибкой, воспроизведено тестом или браузером, либо проверено чтением кода; как
именно, сказано в каждом пункте. Временные repro-тесты лежали в `src/__repro__/` и в коммит не попали.

## Вердикт: FIXES NEEDED (Critical нет, Important: 4)

Экраны портированы аккуратно. Валидация номера, автоопределение страны, Safari-фикс автозаполнения и вставки, каретка
(`use:value` плюс `setSelectionRange` в mutate, как `useLayoutEffect` у tt), ошибки на полях, обновление QR по новому
токену, `useHistoryBack` и переходы между шагами повторяют tt. Run-once ловушек в самих экранах нет: каждое чтение
пропа или сигнала сидит в JSX, memo или compute. Ворота зелёные, визуальный дифф 0 px.

Блокеров для мержа четыре:

- функция мультиаккаунта на экранах входа потеряна молча: результат хука, который теперь accessor, читается как объект;
- `DropdownMenu` путает `onOpen` и `onClose` (latent, в этом слайсе их никто не передаёт);
- heavy-animation в `AnimatedSticker` смешивает root и scope. Стикер, созданный под `Transition` во время root-анимации,
  не инициализируется никогда (latent);
- e2e почти не проверяет поведение, ради которого слайс и писался. Поэтому первый пункт и прошёл.

Из четырёх «engine gaps» отчёта движок виноват в одном (a). (c) и (d) это пробелы API. (b) вообще не про движок:
нарушение даёт `util/websync.ts`, а не `setScrollbarWidthProperty`. Отдельно нашёл настоящий семантический разрыв в
движке, он стоит за I3: слушатель scope не слышит анимации предков, хотя гейтинг их видит. Кроме того, «known gap» про
`onLoad` у emoji в отчёте ложный: обработчик срабатывает.

### Что запускал

| Команда / проверка                                            | Результат                                                                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                  | зелёный (oxlint 0, prettier, tsc, gates diff/tests/licenses, build, size)                                                                           |
| `pnpm test`                                                   | 28 файлов, 304 passed, 2 skipped                                                                                                                    |
| `pnpm test:e2e`                                               | 13 passed (в отчёте 12: в main добавился тест strict-monitor), ноль stricterdom / console-проблем                                                   |
| `pnpm test:a11y`                                              | 11 passed. В логе предупреждение компилятора `<input value={…}> is not controlled` (`RangeSlider.tsx:107`), гейт его не ловит (m4)                  |
| repro (a): vitest, пропы-тернарники, чтение в `apply`         | DEV бросает «…inside an effect apply has no owner» 4 из 4. Скомпилированный геттер: `get size() { return memo(() => !!big())() ? f("A") : f("B") }` |
| repro (b): `pnpm dev` с фиктивным api id, Playwright          | нарушение воспроизведено; источник `<script>` из `websync.ts`, вне любой фазы; `setScrollbarWidthProperty` идёт в mutate                            |
| repro (c): `tsc`, `lazy` + `.then((m) => ({ default }))`      | TS2322 без участия приложения; сигнатура с выводом `C extends Component` проходит                                                                   |
| repro (d): vitest, scope-слушатель + root-анимация            | слушатель дочернего scope не получает start/end root-анимации; `getIsHeavyAnimating()` не видит анимацию дочернего scope                            |
| repro `DropdownMenu` (vitest, mousedown по триггеру)          | при открытии вызывается `onClose`, `onOpen` не вызывается (I2)                                                                                      |
| repro `<img onLoad>` (vitest, не всплывающий `load`)          | обработчик вызывается, `currentTarget` это `img`: компилятор вешает прямой listener, `load` не делегируется (m1)                                    |
| `()()` и `createMemo(() => useX(…))` по 152 изменённым файлам | следов двойного прогона codemod нет                                                                                                                 |

## Important

### I1. Мультиаккаунт на экранах входа потерян: `Object.values(accessor)` всегда `[]`

`src/components/auth/AuthPhoneNumber.tsx:82-84`, `src/components/auth/AuthQrCode.tsx:52`. Источник:
`src/hooks/useMultiaccountInfo.ts:123`, хук теперь возвращает accessor (`createSignal`).

```ts
const accountsInfo = useMultiaccountInfo();
const hasActiveAccount = Object.values(accountsInfo).length > 0; // Object.values(функции) === []
const phoneNumberSlots = createMemo(() => Object.entries(accountsInfo) /* … */);
```

Как у tt: пользователь уже вошёл в аккаунт 1 и добавляет второй, вкладка открыта со слотом `?account=2`. На экранах
номера и QR есть кнопка «назад» (`navigateBack`). Если ввести номер, уже залогиненный в другом слоте, tt переходит в
этот слот (`window.location.replace(getAccountSlotUrl(...))`) и не начинает второй вход.

Что в порте: `hasActiveAccount` всегда `false`, кнопки нет. `phoneNumberSlots()` всегда `{}`, поэтому повторный вход
тем же номером уходит на сервер. `tsc` ошибку не видит: `Object.values` принимает `{}`, а функция ему подходит. Это
классическая ошибка «результат хука как значение», та самая главная категория TODO codemod. Здесь TODO не было, потому
что хук возвращал accessor уже после ручной адаптации.

Fix: `const hasActiveAccount = () => Object.values(accountsInfo()).length > 0;` (в JSX `hasActiveAccount()`) и
`Object.entries(accountsInfo())` в memo. Заодно grep по `use[A-Z]\w*\(\)` с последующим `Object.` / `.length` / spread
по остальным портированным хукам. И e2e-шаг с заранее положенными `SESSION_ACCOUNT_PREFIX`-ключами в localStorage
(кнопка видна; номер из другого слота ведёт на его URL).

### I2. `DropdownMenu`: `onOpen` и `onClose` перепутаны (чтение сигнала после записи)

`src/components/ui/DropdownMenu.tsx:51-57`:

```ts
setIsOpen(!isOpen());
if (isOpen()) {
  props.onClose?.();
} else {
  props.onOpen?.();
}
```

У tt `isOpen` здесь закрытое значение до переключения: «было открыто, значит закрываем, значит `onClose`». В frameact
запись в сигнал видна сразу (framework guide §1, `useState` → `createSignal`), и ветки меняются местами. Repro
(mousedown по триггеру): при открытии вызывается `onClose`. В auth-слайсе `onOpen`/`onClose` никто не передаёт.
Вызывающих в tt десятки (меню чатов, заголовок, настройки), и на первом же из них сломаются фокус, бэкдроп и
аналитика открытия.

Fix: `const wasOpen = isOpen(); setIsOpen(!wasOpen); if (wasOpen) onClose(); else onOpen();`. Стоит добавить правило в
codemod (или хотя бы TODO): `setX(…)`, после которого в той же функции читается `x()`. Это та же ловушка «stale
closure → fresh signal», и `Checkbox.toggleNested` её чудом обходит.

### I3. `AnimatedSticker`: проверяется root, подписка на scope. Стикер под `Transition`, созданный во время root-анимации, не инициализируется

`src/components/common/AnimatedSticker.tsx:88` (`useFlag(!getIsHeavyAnimating() …)`), `:93` (`watchHeavyAnimation`
без scope), `:144` (`init` выходит при `getIsHeavyAnimating()`), `:313` и `:353` (play/pause).

`getIsHeavyAnimating` это `rootScope.isAnimating`. `watchHeavyAnimation` по умолчанию слушает scope поддерева (для
слайда это scope `Transition`), а слушатели scope анимаций предков не получают (repro (d) ниже). Сценарий: стикер
создаётся под `Transition` (монки в `Auth`, позже стикеры в табах пикера), пока идёт root-анимация (`Menu.tsx:112`,
`Modal.tsx:235`, `animateScroll`). Тогда `canInitialize` стартует с `false`, `onEnd` root-анимации до слушателя не
доходит, и measure-эффект больше не перезапускается: стикер пустой навсегда. У tt `useHeavyAnimation` глобальный,
`onEnd` поднимает флаг, `init` проходит. Обратный перекос: анимация `Transition` (scope) ставит стикер на паузу, а
`Menu`/`Modal` (root) нет. У tt паузу давали обе.

Fix (app, сейчас): подписаться и на root, и на scope поддерева (`onHeavyAnimation(start, end, rootScope)` плюс
`watchHeavyAnimation`, с подсчётом активных), а `getIsHeavyAnimating()` в `init`/`isFrozen` заменить на проверку
цепочки scope. Fix (engine): см. «Engine gaps», (d). Та же связка есть в `useVideoAutoPause.ts:1,98`.

### I4. e2e не проверяет поведение слайса; из-за этого и прошёл I1

`tests/e2e/auth.spec.ts`. Тест проходит шаги состояния, но почти не смотрит на то, что делают экраны:

- ошибка: комментарий говорит «shown on the field», а проверяется только `auth.errorKey` в store (`:29-37`). Нет проверки
  `.input-group.error` и текста label, нет проверки, что ввод снимает ошибку (`clearAuthErrorKey`);
- номер телефона: нет форматирования при наборе, каретки при правке в середине, вставки, определения страны по номеру,
  сброса номера при выборе страны. Мок не отдаёт список стран, но его можно положить через `apiUpdate` /
  `setGlobal`, как это делает сам тест для состояний;
- фокус: автофокус на номере, коде, пароле (`onMount`/measure-эффекты) и `select()` в стране не проверены;
- QR: не проверено обновление по новому токену (второй `serverSays` с другим `token`, `qrCode.update`), это
  центральное поведение `AuthQrCode`;
- назад: «изменить номер» на экране кода (`.auth-number-edit`) и history back (`useHistoryBack`);
- «Keep me signed in» (`use:checked` с записью в store) и мультиаккаунт (I1);
- визуальный гейт снимает только состояние покоя. Состояния с ошибкой и с заполненным номером, где разметка
  отличается сильнее всего, не сравниваются.

Fix: 5–6 коротких e2e-сценариев выше; для визуального гейта добавить `auth-code-error` и `auth-phone-filled`.

## Engine gaps из отчёта: вердикты

### (a) Геттер пропа, обёрнутый компилятором в memo, бросает «no owner» в apply. **Баг движка**, не ошибка приложения

Минимальный repro (vitest, DEV):

```tsx
function Child(props: { size?: string; plain: string }) {
  createEffect(
    () => props.plain,
    () => {
      props.size;
    },
  ); // чтение в apply
  return <div />;
}
const f = (x: string) => x;
render(() => <Child size={big() ? f('A') : f('B')} plain={plain()} />, host); // бросает
render(() => <Child size={key() && f(key()!)} plain={plain()} />, host); // бросает
render(() => <Child size={big() ? 'A' : 'B'} plain={plain()} />, host); // не бросает
```

Скомпилированный проп: `get size() { return memo(() => !!big())() ? f("A") : f("B"); }`. Это `wrapConditionals` из
dom-expressions: memo создаётся на каждом чтении геттера, и только если ветки «динамические» (вызов функции). В apply
нет owner, `createMemo` → `assertApplyOwner()` бросает. Падает уже первое применение.

Почему это не ошибка приложения: читать проп в apply законно. Apply это побочный эффект, он не отслеживается; framework
guide не запрещает там читать пропы, а обработчики и таймеры делают ровно это (там assert не срабатывает только потому,
что `inEffectApply` false). Результат зависит от того, как вызывающий записал выражение (`'A'` или `f('A')`), а этого
компонент знать не может. Memo в таком месте ничего не делает: подписчика нет, значение сразу выбрасывается. Протечки
нет (проверил: тысяча чтений из обработчика не дают ни одного пересчёта после записи, memo ленивые), но на каждое
чтение в отслеживаемом контексте создаётся по memo.

Fix в frameact (clean-room PR): в компиляторном примитиве `memo` (`src/dom/component.ts:42`) без owner или без
отслеживающего наблюдателя возвращать `fn` (или `() => fn()`) без `createMemo`. Либо отключить `wrapConditionals` для
геттеров пропов компонентов. До PR обходной путь приложения (проп в compute, значение в apply; memo `live` в
`AnimatedSticker`) корректен, и правило codemod `effects` (зависимость `props.x` передаётся значением) тоже. Но это
обходной путь, а не идиома: в `porting-guide.md` §4.3.1 стоит пометить его как временный, со ссылкой на PR.

### (b) stricterdom «приписывает мутацию `requestForcedReflow` фазе measure». **Не движок: атрибуция верная, источник указан неправильно**

Воспроизвёл сценарий отчёта: `pnpm dev`, `TG_TELEGRAM_API_ID=12345`, фиктивный hash, Playwright 30 с. Нарушения
`Unexpected mutation childList of <body> … [measure]` есть. Потом обернул `appendChild`/`removeChild`/`remove` у
`body` логом с фазой (`getPhase()`, `isInFramePass()`) и стеком:

- `setScrollbarWidthProperty`: `appendChild` в `phase=mutate inPass=true` (из `runMutationTasks`), `remove` в
  `phase=mutate inPass=true` (из `runForcedReflowMutations`). Чисто;
- `util/websync.ts:51` `document.body.appendChild(script)` (из `forceWebsync` ← `global/actions/api/initial.ts:166`) и
  `:44` `removeChild` из `script.onload`: `phase=measure inPass=false`. **Вот эти записи и ловит stricterdom.**

Мокнутая загрузка нарушения не показывает, потому что `forceWebsync` при `IS_MOCKED_CLIENT` выходит сразу. В jsdom
дополнительно прогнал шесть порядков (`requestForcedReflow` из measure-, mutation- и forced-reflow-задач, из микрозадачи
между сегментами прохода, `flushSync` из микрозадачи): ни одного ложного срабатывания.

Fix (app): в `websync.ts` вешать `<script>` в `document.head` (observer stricterdom следит только за `body`, а
`<script>` в head для JSONP-пинга по смыслу то же самое) или обернуть в `requestMutation`. В обоих случаях это
`// Deviation:`. Пункт 2 в «Engine gaps» отчёта убрать.

### (c) `lazy<P>()` не выводит `P`. **Пробел API (типы), с минимальным repro без приложения**

```tsx
const mod = { X: () => <div />, Y: (p: { a: number }) => <div>{p.a}</div> };
lazy(() => Promise.resolve(mod).then((m) => ({ default: m.X }))); // TS2322
lazy(() => Promise.resolve(mod).then((m) => ({ default: m.Y }))); // TS2322
lazy(() => Promise.resolve({ default: mod.Y })); // ок
```

Ошибка: `Promise<{ default: Component<never> } | { default: () => Element }>` не присваивается. Контекстный тип
возврата `Promise<{ default: Component<P> }>` протекает в `TResult2` у `.then`, пока `P` ещё не зафиксирован. Это ровно
та форма, которую рекомендует framework guide (`*.async.tsx` → `lazy(() => loadBundle(…).then((m) => ({ default:
m.Name })))`), то есть документированная идиома не компилируется. Проверил сигнатуру
`lazy<C extends (props: any) => unknown>(loader: () => Promise<{ default: C }>): LazyComponent<Parameters<C>[0]>`: оба
случая выводятся, лишний проп ловится. Это PR в frameact. Явный `lazy<OwnProps>` в codemod остаётся корректным
обходным путём до него.

### (d) У `watchHeavyAnimation` нет флага отключения. **Пробел эргономики, не баг; но рядом настоящий семантический разрыв движка**

Флаг выражается публичным API, причём точнее, чем guard в колбэках:

```ts
const scope = currentHeavyAnimationScope();
createEffect(isDisabled, (disabled) => (disabled ? undefined : onHeavyAnimation(onStart, onEnd, scope)));
```

`onHeavyAnimation` сразу зовёт `onStart`, если scope уже анимирует, и возвращает отписку, а apply возвращает её как
cleanup. Это ровно `useHeavyAnimation(…, isDisabled)` у tt. Guard в колбэках (`AnimatedSticker.tsx:90-99`,
`useVideoAutoPause.ts`) теряет «`onStart` сразу при включении посреди анимации» и может вызвать `onEnd` без `onStart`.
Флаг в `watchHeavyAnimation(…, { disabled: accessor })` удобен, но это не блокер.

Настоящий разрыв (repro, vitest): слушатель, подписанный на дочерний scope, **не получает** start/end анимации
`rootScope` (`scopeListeners` хранятся на каждом scope отдельно, `begin` уведомляет только свои,
`heavyAnimation.ts:246-258`). Гейтинг эффектов при этом обходит цепочку `scope → parent → root`
(`firstAnimatingScope`). В итоге эффекты поддерева root-анимация паркует, а `watchHeavyAnimation` поддерева о ней не
знает, и `getIsHeavyAnimating()` (только root) не знает об анимации scope. Отсюда I3. Предложение для frameact:
`watchHeavyAnimation(scope)` должен сообщать о переходах «первый анимирующий scope в цепочке есть / нет» (как гейтинг),
плюс экспортировать `isHeavyAnimating(scope)` с той же семантикой цепочки.

## Minor

- **m1. «Known gap» про `onLoad` emoji ложный.** `renderText.tsx:146`: `load` нет в `DelegatedEvents`, компилятор вешает
  прямой listener (`addEvent(_el$, "load", …)`). Repro: не всплывающий `load` вызывает обработчик, `currentTarget`
  указывает на `img`. Строку из отчёта (раздел «Known gaps») убрать.
- **m2. Kit `Transition`: `reveal`/`slideFadeAndroid` назад ждут не тот слайд** (`src/lib/kit/transition.ts:369` всегда
  `next.el`). У tt для них при `isBackwards` ждётся уходящий слайд. В порте конец наступает только по fallback через
  1 с, и всё это время держится heavy-анимация (паркует store-эффекты поддерева, `onStop` запаздывает). Kit это код
  приложения (`src/lib/kit`), не движок: чинится сейчас одной строкой (`(name === 'reveal' || name ===
'slideFadeAndroid') && !forwards && prev ? prev.el : next.el`) плюс тест. Сейчас вызывающих нет.
- **m3. Kit `Transition`: `shouldRestoreHeight` пересчитывается только на смене шага и на `restoreHeightKey`** (`:389`).
  У tt эффект зависит от `children` и срабатывает на каждом ре-рендере родителя; из 7 вызывающих tt только один
  передаёт `restoreHeightKey`. Шесть остальных в будущих слайсах получат устаревшую высоту контейнера, когда контент
  слайда меняет высоту без смены ключа. Нужен `ResizeObserver` на активном слайде (или явный `restoreHeightKey` у каждого
  вызывающего). Этого пункта нет в списке пробелов Transition в отчёте, добавить.
- **m4. `RangeSlider.tsx:107`**: `<input value={…}>` без `use:value`, компилятор предупреждает «not controlled»
  (виден в логе a11y). Перетаскивание откатываться не будет, но предупреждение надо закрыть: `use:value` или
  `prop:value` с комментарием.
- **m5. `Transition`/`Portal` (87 % / 79 %)**: отклонения необходимы. `Transition` отдаёт DOM слайдов kit, поэтому код
  tt (`rendersRef`, `teactFastList`, классы в `useLayoutEffect`) некуда переносить. Адаптер сводится к маппингу пропов,
  `selectCanAnimateInterface` и fallback имён. `nextKey`, свайп и `slideOptimized` в слайсе никто не использует (grep
  по `src`), пометки TODO честные. `Portal` сохраняет форму DOM tt (обёртка в `#portals`, перенос при смене
  контейнера). Одно расхождение: при отсутствующем контейнере tt ничего не рендерит, а здесь fallback в
  `document.body`. Оно помечено, но лучше `mount` → `undefined` → не рендерить, чем молча вставить в body.
- **m6. Allowlist**: около 20 из 37 записей (`GramIcon`, `SafeLink`, `MenuItem`, `RangeSlider`, …) несут одну и ту же
  причину «effects split into compute/apply by phase; see the Deviation comments in the file», хотя во многих эффектов
  или `// Deviation:` нет. `AGENTS.md` требует причину по существу. Переписать одной строкой по факту (пропы → геттеры,
  `memo` снят, `className` → `class`).
- **m7. Отчёт и baseline**: `pnpm test:e2e` сейчас 13, а не 12. Причина в baseline a11y говорит «CountryCodeInput.tsx,
  PasswordForm.tsx are ported verbatim», а они прошли codemod и ручные правки; надо писать «markup as in tt».
- **m8. Codemod**: ветка `inputEvents` «оба `onChange` и `onInput` → TODO» тестом не покрыта. `paramName` (`x2`) не
  проверяет коллизию с существующей переменной `x2` в области видимости (дешёвый guard: `path.scope.hasBinding`).

## Codemod (п. 4): исправления корректны

- `inputEvents`: `onChange` → `onInput` только на intrinsic-элементах, кроме `<select>`; компоненты не трогаются. Для
  checkbox/radio/file это тоже верно: `input` у них срабатывает вместе с `change`. Тест есть (input, textarea, select,
  компонент).
- `attributes`: переименование только на intrinsic-элементах, список совпадает с тем, чего нет в `jsx.d.ts`
  frameact. Тест есть.
- `lazy<Props>` + placeholder из `X ? <X/> : <Loading/>`: тест на оба случая (`OwnProps`, `Record<string, never>`).
  Обходит (c) корректно.
- `as const` для кортежей зависимостей: только когда apply деструктурирует и нет `prev`. Тест
  `createMutationEffect(() => [props.isOpen, n()] as const, ([isOpen2, n2])` есть.
- Зависимости `props.x` передаются в apply значением, чтения внутри колбэка переписаны (кроме присваиваний). Это
  верно и для (a), и для семантики tt: замыкание видит значение на момент эффекта. Тесты обновлены.
- Двойной прогон (`x()()`): по 152 изменённым `.ts/.tsx` в `src` следов нет, `createMemo(() => useX(…))` тоже нет.

## Проверено и в порядке

- `Auth`: ключи 0–4 и default совпадают с tt, `currentOrPrev(…, { skipUndefined })` повторяет `useCurrentOrPrev(…, true)`,
  рендер по `slide.key` даёт уходящему слайду его собственный экран. Keep-alive kit ({предыдущий, активный}) совпадает
  с `rendersRef` tt без `renderCount`, так что «назад к номеру» сохраняет введённое, как у tt.
- `AuthPhoneNumber`: все пять эффектов tt на месте и в правильных фазах (фокус в measure, `setSelectionRange` в
  mutate, загрузки в tickEnd). Safari-эвристика читает `fullNumber()` до записи, как замыкание tt.
  `handlePhoneNumberChange` повторяет tt построчно.
- `AuthCode`: `onInput` режет до 5 цифр, направление трекинга монки, автоотправка на 5-й цифре. `CountryCodeInput`:
  memo `filteredList` вместо `useSyncEffect` (заодно следует за сменой языка списка, у tt там устаревшее значение),
  `<For keyed>`, `select()` по таймеру как у tt, Backspace очищает выбранную страну.
- `AuthQrCode`: `data-stricterdom-ignore` вместо `disableStrict` + 50 мс годится (сторонний писатель DOM), cleanup
  `unmarkQrMounted` и повторный `append` совпадают с tt.
- `App`: memo экрана (по зависимостям совпадает с ре-рендерами tt), `previous` = `usePrevious` tt (предыдущее
  отличающееся значение), классы body через `requestMutation`, `in-background` через `forceMutation`, как у tt.
- Локализация: рантайм tt дословно, узлы `withNodes` не кэшируются (`isCacheable = !withNodes`), так что один DOM-узел
  не попадёт в два места. Proxy `lang` отслеживает и вызов, и чтение свойств (`isRtl`, `withRegular`).
  `NEXT_ARROW_REPLACEMENT` как геттер нужен.
- `InputText`: `use:value` переносит каретку сам, а `setSelectionRange` из `AuthPhoneNumber` идёт после него в том же
  mutate, это порядок tt (value в commit, затем layout-эффект).

## Re-review: fix round

Диапазон `9249b68..HEAD` без merge (`79210b0` … `d03134f`, плюс `be047ac` с портами), HEAD `a2e75d3`. Каждое
исправление проверял мутацией: откатывал фикс локально, гонял его тест, восстанавливал (`git checkout`). Временный
repro-тест и временный e2e лежали в `src/__repro__/` и `tests/e2e/`, в коммит не попали.

### Вердикт: READY TO MERGE (Critical нет, Important нет)

Все четыре Important закрыты, тесты на них настоящие: без фикса они краснеют. Новые находки только Minor (ниже). Одна
поправка к моему первому ревью. Я писал, что обновление QR по новому токену «повторяет tt». Это было неверно. Новый e2e
нашёл баг, и он старше `depsOf`: без `depsOf`, с исходным `authQrCode()` в compute, QR-тест тоже красный. Store
вливает новый токен в тот же proxy, и compute не перезапускается.

### Что запускал

| Команда / проверка | Результат                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`       | зелёный (oxlint, prettier, tsc, gates diff/tests/licenses, build, size)                                                                                        |
| `pnpm test`        | 34 файла, 319 passed, 2 skipped                                                                                                                                |
| `pnpm gates`       | diff, upstream, tests, licenses, size: PASS                                                                                                                    |
| `pnpm test:e2e`    | 29 passed. В логе есть `Failed to fetch … actions/all.ts`, stricterdom на `#Main` и `uncaught!`, но это намеренные сценарии `boot.spec` и `strictMonitor.spec` |
| `pnpm test:a11y`   | 11 passed                                                                                                                                                      |

### Мутации (фикс откачен, должен краснеть его тест)

| Фикс                      | Откат                                                                                           | Результат                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| I1 `AuthPhoneNumber`      | `Object.values/entries(accountsInfo)`                                                           | `authMultiaccount.spec`: 2 красных (кнопка назад, переход в слот)                  |
| I1 `AuthQrCode`           | то же                                                                                           | `authMultiaccount.spec`: «QR … back button» красный                                |
| I2 `DropdownMenu`         | `if (isOpen())` после записи                                                                    | `uiPorted.test`: красный                                                           |
| I2-класс `AuthCode`       | `code()` после `setCode`                                                                        | `AuthCode.test`: красный. `readAfterSet.ts` на откате `DropdownMenu` находит `:55` |
| I3 цепочка подписок       | подписка только на свой scope                                                                   | 4 красных (`AnimatedSticker.test` ×2, `heavyAnimationScope.test` ×2)               |
| QR по токену              | `authQrCode()` вместо `?.token`                                                                 | `authBehavior` QR красный; без `depsOf` тоже красный                               |
| Appsec Low 1              | убран `shouldCleanup`                                                                           | `auth.spec`: красный (`#sign-in-password` остаётся)                                |
| Appsec Low 2              | `replaceAll(str, str)`                                                                          | `localization.test`: красный                                                       |
| `depsOf`                  | всегда `return next`                                                                            | `effectDeps.test` и `RoundTimer` красные                                           |
| `useHistoryBack`          | `!read(isActive)` в `onDestroy`                                                                 | `useHistoryBack.test`: красный                                                     |
| `PasswordForm`            | `onSubmit` связан один раз / задержка прочитана один раз                                        | оба теста `PasswordForm.test` красные                                              |
| `forwardedHandlers`       | `Loading`                                                                                       | красный                                                                            |
| `forwardedHandlers`       | `Button.onContextMenu`, `MenuItem.onContextMenu`, `GramIcon`, `StarIcon`, `InputText.onKeyDown` | **зелёные** (см. m-r1)                                                             |
| `isHeavyAnimatingInChain` | смотрит только свой scope                                                                       | **зелёные** (см. m-r2)                                                             |
| счётчик `busy`            | `onEnd` на каждом конце                                                                         | **зелёные** (см. m-r2)                                                             |

### Проверено и в порядке

- **I1.** `hasActiveAccount()` и `Object.entries(accountsInfo())` в memo. e2e кладёт `account2` в localStorage и
  открывает вкладку слота 3. Проверены кнопка «назад» на телефоне и QR, номер чужого слота ведёт на его URL, новый
  номер начинает вход. Тест осмысленный.
- **I2.** `wasOpen` до записи. Сканер `readAfterSet.ts` нашёл ещё `AuthCode`: направление трекинга монки никогда не
  шло назад. Исправлено, тест на реальном `InputText`.
- **I3.** `heavyAnimationChain.ts` семантически корректен как временная замена. `isHeavyAnimatingInChain` повторяет
  гейтинг движка (scope → parent → root). `watchHeavyAnimationInChain` считает активные scope цепочки: вложенные
  root- и scope-анимации дают один start и один end, а `onStart` сразу вызывается, если цепочка уже занята. Так ведёт
  себя tt для всего, что выше стикера. Отличие от глобального хука tt осталось одно: анимация **соседнего** scope
  (другой `Transition`) стикер не паузит. Это осознанная модель frameact, но комментарий в файле обещает «pause for
  every animation», а это не так (m-r3). Вендор `src/vendor/frameact` стоит на `3e8787c`, до frameact#21 (merged). Так
  что хелпер пока нужен. После обновления сабмодуля он останется корректным (счётчик не даст двойного start), но станет
  избыточным.
- **I4.** В `authBehavior.spec.ts` **12** тестов, а не 13, как пишет отчёт. Почти все проверяют поведение: ошибку на
  поле и текст label, сброс ошибки вводом, форматирование и определение страны, сброс номера при выборе страны и фокус
  на нём, фокус на каждом экране, отбор цифр, обрезку до 5 и автоотправку, «Keep me signed in» в store, «изменить
  номер» и browser Back, перерисовку QR без второго `append`. Тест сразу нашёл настоящий баг QR. Слабые места мелкие:
  проверка неизвестного префикса тривиальна (`/^\+999/`). Тест «edit number» смотрит только на `errorKey`, а не на
  экран. В тесте выбора страны есть тавтология `'+1 '.trimEnd() === '+1' ? … : ''`. Визуальные состояния
  `auth-code-error` и `auth-phone-filled` по-прежнему не сделаны, это честно отмечено.
- **Appsec Low 1/2.** `shouldCleanup` у `Transition` в `Auth` и replacer-функция в `processTranslation`. Оба помечены
  `// Deviation:`. Отчёт пишет, что из-за cleanup «назад больше не показывает введённый номер». Временным e2e проверил:
  это **неверно**. После «изменить номер» поле снова `+1 650 555 1234`, потому что `parseFullNumber(authPhoneNumber)`
  восстанавливает его из store (m-r4).
- **`depsOf` и правило `effectDeps`.** Семантика совпадает с teact: `teact.ts:748` сравнивает поэлементно через `!==`,
  `depsOf` через `Object.is`. Разница только в `NaN` и ±0, и `depsOf` тут даже точнее. Длина массива сравнивается.
  Первый прогон apply выполняется, `prev` у apply сохраняется (возвращается прошлый массив). Правило идемпотентно
  (обёрнутый compute уже не arrow), стоит после `effects`, импорт добавляется через `imports`. Выборочно прочитал
  `AuthPhoneNumber` (4), `AuthQrCode`, `useAsync`, `useMedia`, `useVirtualBackdrop` (там `onClose?.()` это accessor
  колбэка, не вызов обработчика), `AvatarStoryCircle`, `Modal`/`Menu` (`props.onClose` по ссылке, как deps tt),
  `AnimatedSticker`, `useInterval`, `RoundTimer`. Store-контейнер по идентичности сравнивается только в исправленном
  QR. Остальные элементы примитивы, accessor'ы, колбэки или массивы пропов.
- **`useHistoryBack`.** У tt cleanup читал `isActive` первого рендера. Здесь проверка снята, а `processBack` сам
  трогает только открытую запись (`index` задан и `!wasReplaced`). Повторного back после `isActive → false` нет:
  `processBack` выставляет `wasReplaced`. Компонент, который так и не стал активным, ничего не делает. Отличие от tt в
  лучшую сторону: «смонтирован неактивным, потом открыт и размонтирован открытым» у tt оставлял запись висеть.
  Помечено `Deviation`.
- **`PasswordForm`.** Задержка фокуса стала accessor'ом и следует за раскладкой. `onSubmit` вызывается через проп.
- **`forwardedHandlers` и перф.** Цена: одно замыкание на обработчик на экземпляр при создании. Для делегируемых
  событий (`click`, `contextmenu`, `mouseup`, `keydown`) лишнего listener'а нет. Для неделегируемых (`transitionend`,
  `animationend`, `mouseenter/leave`, `load`, `blur`, `paste`, `on:filehoveropen`) listener теперь висит всегда, даже
  без пропа, и на каждое событие вызывает no-op. Это редкие события, на горячем пути не дорого. Риск будущий, см.
  m-r5.
- **a11y-baseline.** Новые записи только `color-contrast`: label'ы телефона и регистрации, label'ы в
  `.DropdownMenu`, кнопка на QR. Визуальный дифф с tt на этих пяти экранах 0 px, то есть цвета те же, что у tt.
  Значит, это контраст стилей tt, а не регрессия порта, и реальных проблем baseline не прячет. Других правил не
  добавилось, проверка «stale» не даёт baseline расти незаметно.
- **`AnimatedSticker` 0.67 → 0.72.** Фактически 67.9 %, запас 4.1 п. У остальных записей allowlist запас 3–6 п.
  (`AnimatedIcon` 3.0, `useMedia` 3.7, `useLangString` 5.0), так что повышение обосновано: рост дали многострочные
  `depsOf` и цепочка scope.
- **Порты (`tests/config.ts`).** Смещение от хеша `cwd` (шаг 5, 200 корзин), в CI 0, env-переменные важнее. Все три
  конфига и `tt-run` (через `env.TT_PORT`) берут порты из одного места. Здесь получился DEV-порт 1725.

### Minor (не блокирует)

- **m-r1. Тест «handlers added later» слабее заявленного.** Откат `Button`/`MenuItem.onContextMenu` его не валит:
  `<button>` и `MenuItem` лежат внутри `<Show>`, и чтение `props.onContextMenu` при создании элемента отслеживается
  memo у `Show`. Поддерево пересоздаётся на смене обработчика, и новый обработчик «случайно» оказывается на месте.
  `GramIcon`, `StarIcon`, `DropdownMenu.onTransitionEnd` и `InputText` тестом не покрыты вовсе. Фиксы верны (это видно
  из кода и из repro, где `addEvent(_el$, "contextmenu", props.onContextMenu, true)` связывается один раз). Но в тест
  стоит добавить проверку, что DOM-узел не пересоздан (`expect(el.querySelector('button')).toBe(before)`), и покрыть
  оставшиеся компоненты. Попутно видна ловушка: run-once чтение пропа внутри дочернего `<Show>` молча пересоздаёт всё
  поддерево. Это стоит строки в porting-guide.
- **m-r2. Нет тестов на счётчик `busy` и на `isHeavyAnimatingInChain` в `init`/`isFrozen`.** Оба отката зелёные. Нужны
  тесты: одновременные root- и scope-анимации (конец одной не должен снимать паузу) и стикер с `play`, созданный под
  `Transition` во время root-анимации (не должен играть до её конца).
- **m-r3. `heavyAnimationChain.ts`.** Поправить комментарий: соседние scope не слышны. TODO сейчас
  `frameact#engine-gaps`; указать `frameact#21` (merged) и шаг «обновить сабмодуль, сделать re-export».
- **m-r4. Отчёт.** «13 tests» → 12. Убрать утверждение, что с `shouldCleanup` «назад» теряет номер. У QR-записи в
  `baseline.json` причина скопирована про «floating labels», а нарушает кнопка. Цель `button` слишком общая: любую
  будущую кнопку с плохим контрастом на этом экране baseline примет молча. Лучше `.auth-form button` или id.
- **m-r5. Правило `forwardedHandlers`.** Для `onWheel`/`onTouch*` вне делегирования, если такие появятся, правило
  повесит непассивный listener навсегда, а это блокирует композиторную прокрутку. Таким событиям нужен TODO вместо
  переписывания. В тесте правила `effectDeps` идемпотентность проверяется той же строкой, что и первая замена. Стоит
  добавить `expect(code).not.toContain('depsOf(depsOf')`.
- **m-r6. Тестовая инфраструктура.** `serverSays` раз в 100 мс переотправляет состояние, если `auth.state`
  разошёлся. Это лечит гонку мок-синка (`sync.ts` совпадает с tt), но заодно скроет клиентскую регрессию, при которой
  приложение само сбросит `auth.state`. Лучше ограничить повтор окном синка или логировать каждое срабатывание.
  `quality-gates.md` обещает, что worktree «never» переиспользуют чужой сервер. При 200 корзинах это вероятностно
  (5 worktree дают около 5 % коллизий). Надёжнее сверять маркер checkout'а у найденного сервера. Перф-тест набора
  теперь ждёт 1.5 с после смены экрана. Сама смена (около 70 мс при 4x) осталась без гейта, её стоит сравнить с tt
  отдельным замером.
- Остались открыты из первого ревью: m2, m3, m4, m5/m6, m8 и `websync.ts`. Они перечислены в отчёте как «Not changed».
