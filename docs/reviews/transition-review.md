# Ревью: завершение `Transition` (`port/transition`, `origin/port/auth..3a8d5de`, 9 коммитов)

Ветка `port/transition`, эталон `reference/telegram-tt@090e38f` (`src/components/ui/Transition.tsx`,
`src/util/{swipeController,captureEvents,lethargy}.ts`), только чтение. Проверено по `AGENTS.md`,
`docs/porting-guide.md` §4.2, `docs/reports/slice-auth.md` (раздел Transition) и чек-листу `perf-review`.

## Вердикт: FIXES NEEDED для свайпа (Critical нет, 2 Important). `nextKey`, `slideOptimized`, watched slide можно мержить

`nextKey`, `slideOptimized` / `slideOptimizedRtl` и ожидание `animationend` на `from` для `reveal` / `slideFadeAndroid`
перенесены точно: классы, порядок записей, тайминги, `onStart` / `onStop` и политики cleanup совпадают с tt. Все
расхождения либо обоснованы, либо исправляют зависание tt. Фазовая дисциплина соблюдена, перф дешёвый: при перетаскивании
нет layout, а скрипт и style вместе занимают около 0,8 мс на событие move при CPU ×4. Утечек на 60 циклах
mount → свайп → dispose не видно.

Обе Important-находки относятся к пути свайпа. Сейчас они не задевают приложение: у `captureControlledSwipe` нет
ни одного вызова, кроме dev-харнесса. Чинить их нужно до порта `LeftColumn` / `Settings`, где появятся первые потребители:

- **I1.** Глобальный `isSwipeActive` может залипнуть. Тогда шаг навсегда замирает на паузе, без fallback и без
  `onStop`. Scope transition всё это время анимируется, и store-gate держит store-эффекты слайдов (список чатов в
  `LeftColumn`). Каждый следующий шаг с `withSwipeControl` захватывает фантомный свайп.
- **I2.** Шаг под свайпом перебивается новым шагом. `swipe.dispose()` пропускает cleanup свайпа, и на слайдах навсегда
  остаётся inline `animation-timing-function: linear`. У перебитого шага остаётся ожидание без fallback, и в одном
  сценарии его heavy animation не завершается никогда.

### Что запускал (HEAD `3a8d5de`)

| Команда                                                    | Результат                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                               | зелёный (lint, prettier, tsc, gates diff/tests/licenses, build, size)                                                                                                                                                                                                                              |
| `pnpm test`                                                | 28 файлов, 330 passed, 2 skipped; `transition.test.ts`: 40 тестов                                                                                                                                                                                                                                  |
| `pnpm test:e2e` (`E2E_DEV_PORT=1272`)                      | `transition.spec.ts` 5/5. При 5 воркерах падают `auth.spec.ts:8` и `app.spec.ts:17` (`?api`). На базе `origin/port/auth` (отдельный worktree, порт 1275) они падают так же, а с `--workers=1` на HEAD проходят все 10 тестов auth/app/a11y. Это нестабильность под нагрузкой, к ветке не относится |
| `pnpm test:a11y`                                           | при 5 воркерах `auth: code/password` (иногда phone/QR) падают по timeout / color-contrast. На базе то же, с `--workers=1` всё зелёное                                                                                                                                                              |
| `pnpm test:perf` (`E2E_PREVIEW_PORT=1274`)                 | leaks pass. Long-task gate «typing» нестабилен: HEAD 4 падения из 9, база 1 из 9, задача 63–74 мс в одной и той же точке (~4,1 с) на обеих. В trace при ×4 самая длинная задача 19 мс на HEAD и 25 мс на базе, кода Transition в этом окне нет. Регрессией не считаю, но стоит следить             |
| `pnpm test:visual` (`TT_PORT=1273`)                        | 8 passed, 3 skipped                                                                                                                                                                                                                                                                                |
| мутации в `transition.ts` / `swipeController.ts` (10 штук) | ловятся 7 из 10, см. «Тесты»                                                                                                                                                                                                                                                                       |
| пробы (временные тесты, удалены)                           | A–F в unit-окружении и замеры в Chromium, см. I1, I2 и «Перф»                                                                                                                                                                                                                                      |

На старте ревью порт 1240 уже слушал чужой dev-сервер (pid 90200, другой worktree). Это ровно та инфраструктурная
проблема, о которой пункт 6.

## Important

### I1. Залипший `isSwipeActive`: шаг замирает навсегда, store-эффекты слайдов стоят в парковке, следующий шаг захватывает фантомный свайп

`src/util/captureEvents.ts:231` (`if (hasMoved)`), `:455-456` (stop вызывает `onRelease()` без события),
`src/util/swipeController.ts:32` (`swipeThreshold: 10`), `:57-66`, `src/lib/kit/transition.ts:535-539`.

`captureControlledSwipe` выставляет `isSwipeActive = true`, когда смещение достигает 10 px. Сбрасывает его только
`options.onRelease` из `captureEvents`, а тот вызывается при `hasMoved`, то есть от 15 px (`MOVE_THRESHOLD`), и только
при наличии события. В трёх случаях флаг остаётся `true`:

- **(a)** палец отпущен на 10–14 px. Это **измерено** (проба A). После `touchend` и 5 с таймеров состояние такое:
  `log: ['start']`, `isAnimating: true`, `isBlocking: false`, у слайдов `-to` / `-from`, анимации `paused`, timing `linear`;
- **(b)** владелец жеста размонтирован посреди перетаскивания. `captureEvents` stop вызывает `onRelease()` без `e`, и
  `options.onRelease` не срабатывает. Это **измерено** (проба E);
- **(c)** страница теряет видимость, а `touchcancel` не приходит. Это **рассуждение**: обработчика `visibilitychange` нет.

Дальше любой шаг с `withSwipeControl` захватывается свайпом, которого нет: анимации ставятся на паузу, fallback не
взводится, drag и release не придут никогда. Это **измерено** (пробы D и E): программный шаг `0 → 2` спустя 0,5 с
оставляет `log: ['start','stop','start']`, `s2: Transition_slide-to`, `paused`, `isAnimating: true` даже через 5 с.

- **Сценарий в tt.** Короткий flick назад в `Settings` или `LeftColumn` на iOS. Либо закрытие колонки (смена layout,
  logout) при пальце на экране.
- **Почему важно.** Сама причина взята из tt байт в байт. Но в frameact последствие тяжелее. Пока scope «анимируется»,
  store-gate (`frameact/src/store/gate.ts:45`) паркует store-эффекты слайдов, причём и при non-blocking тоже. Для
  `LeftColumn` это означает, что список чатов перестаёт отражать store, пока кто-нибудь не сделает новый drag длиннее
  15 px. На экране при этом активен ключ, который пользователь не видит, а у слайда `-from` стоит `pointer-events: none`.
- **Как исправить.** Нужны два локальных `// Deviation:`:
  1. в `captureEvents.onRelease` сообщать release, если был swipe, даже без `hasMoved`: `if (hasMoved || hasSwiped)`;
  2. в функции, которую возвращает `captureControlledSwipe`, вызывать stop: если `isSwipeActive`, сбросить флаг и вызвать
     `onRelease?.(options.onCancel)`, то есть откатить жест, как при отпускании назад.

  Страховка на стороне kit: пока свайп держит шаг, слушать `visibilitychange` / `pagehide` как release. Тесты: release
  на 12 px, unmount владельца посреди drag, `touchcancel`.

### I2. Перебитый шаг под свайпом: inline `linear` остаётся навсегда, ожидание без fallback может держать heavy animation вечно

`src/lib/kit/transition.ts:491-494` (supersede: `running.swipe?.dispose(); stopStep(running)`), `:568-571`, `:418`;
`src/util/swipeController.ts:196-208` (`dispose`), `:180-181` (`onEnd`: `if (isDisposed) return`).

`dispose()` выставляет `isDisposed = true` и только потом отменяет инерцию. `animateNumber` при отмене вызывает
`onEnd(true)`, тот видит `isDisposed` и выходит. Поэтому `cleanup()` свайпа не запускается: inline
`animation-timing-function` не сбрасывается, а поставленные на паузу анимации не отменяются.

- **Измерено (проба B2).** Свайп с commit, во время 300 мс инерции новый шаг `0 → 2`, `renderCount: 3`. Слайд 1 уходит в
  `-inactive` (`display: none`), поэтому `animationend`, на который подписан `cleanup`, не придёт. Итог:
  `slides: ['…-inactive|timing=linear', '…-inactive|timing=linear', '…-active|timing=']`. С `renderCount` слайды живут
  вечно, и все их будущие анимации идут линейно, а не с easing из stylesheet. В `LeftColumn` (`shouldCleanup`,
  `cleanupExceptionKey = Main`) так навсегда портится слайд `Main`.
- **Измерено (проба C).** Программный шаг при пальце на экране. tt и kit отдают новый шаг тому же пальцу. Ожидание
  перебитого шага осталось без fallback (режим свайпа) и висит на слайде, анимация которого стоит на паузе. Если новый
  жест откатить, `animationend` на этом слайде не придёт никогда, и heavy animation перебитого шага не завершится.
  `isAnimating` остаётся `true`, а store-эффекты слайдов, как в I1, стоят в парковке.
- **tt.** Когда во время инерции начинается шаг с `withSwipeControl`, `allowSwipeControlForTransition` вызывает
  `cancelCurrentReleaseAnimation()`, и проходит полный `cleanup()` плюс `onCancel` клиента (у tt здесь свой баг: откат
  клиента на commit). Kit сознательно не зовёт отмену клиента, и это правильно, но вместе с ней теряет cleanup.
- **Как исправить.**
  1. `dispose()` сбрасывает стили: `requestMutation(() => { …style.animationTimingFunction = '' })` и отменяет
     анимации, которые всё ещё стоят на паузе;
  2. supersede шага со `step.swipe` обрабатывать как `interrupt`: `cancelWait`, `swipe.dispose` и `endHeavyAnimation`
     **после** `scope.begin` нового шага, чтобы scope не мигнул в idle.

  Тест: мутация «убрать `swipe?.dispose()` при supersede» (M9) сейчас проходит все 40 тестов, то есть путь не покрыт.

## Minor

- **m1. Направление жеста: равный прогресс считается откатом** (`swipeController.ts:155`,
  `newProgress > progress ? 1 : -1`, байты tt). На iOS `touchmove` с тем же `x` приходит при смене force или radius,
  а за краем прогресс упирается в clamp, и каждое движение даёт −1. Отпускание после такого события откатывает жест.
  Измерено (проба F): drag за край, отпускание → `swipeCalls: ['right','cancel']`. Предлагаю
  `if (newProgress !== progress) currentDirection = …` с пометкой `// Deviation:`. Мутация M8 тесты не ловят.
- **m2. Палец отпущен до первого measure** (`swipeController.ts:129-136`). Отклонение обосновано: в tt анимации
  остались бы на паузе навсегда. Но они продолжают идти с inline `linear` вместо easing из stylesheet. Перед `play()`
  стоит сбросить `animationTimingFunction` через `requestMutation`.
- **m3. Работа на каждое движение пальца** (замерено в «Перф», бюджет укладывается). `updateAnimationProgress`
  вызывает `getAnimations()` дважды на событие (каждый вызов сбрасывает style) и создаёт четыре массива. Анимации не
  меняются весь жест, их можно один раз запомнить в первом measure. В `captureEvents.onMove` на iOS с
  `selectorToPreventScroll` (в `LeftColumn` он задан) на каждое движение ставится `requestMutation`: замыкание,
  `querySelectorAll` по документу и запись `overflow`. В tt это было синхронно, но тоже на каждое движение. Хватит флага
  «один раз за жест».
- **m4. Бандл +1,3 KiB brotli в entry** (замерено по sourcemap, в минифицированных байтах). `kit/transition.ts`
  выросла на 2,0 KB, это реальные фичи. `util/lethargy.ts` прибавил 1,2 KB мёртвого кода: класс держит module-level
  `new Lethargy(…)` в `captureEvents.ts:99`. `util/animation.ts` переехал целиком (+2,1 KB) в entry-chunk `animation`.
  Тело `allowSwipeControlForTransition` бандлер свернул в константу, потому что у `captureControlledSwipe` нет вызовов,
  и `isSwipeActive` никогда не становится `true`. С портом `LeftColumn` эти байты станут нужны (в tt они тоже в main),
  так что приоритет низкий. Дешёвый фикс: `/* @__PURE__ */` перед `new Lethargy` или ленивый экземпляр. Отдельный
  вопрос слоёв: kit теперь импортирует `util/swipeController` → `captureEvents` → `windowSize`, а `AGENTS.md` пишет,
  что kit импортирует только публичный API frameact. Нужно либо обновить формулировку, либо сделать хук инъекцией.
- **m5. Конец шага: порядок высоты и `onStop`** (было и раньше). Kit вызывает `onStop` до того, как высота контейнера
  записана: её пишет следующая фаза того же кадра. У tt наоборот, сначала высота, потом `onStop`. Кроме того, kit пишет
  `flex-basis`, а tt в конце шага пишет только `height`. Влияет только на обработчик `onStop`, который меряет контейнер.
- **m6. Несколько пальцев** (байты tt). Второй `touchstart` заново захватывает жест. Смещение обнуляется, прогресс
  прыгает к 0, направление становится −1, слушатели на первом target живут до его `touchend`. Только отметить.
- **m7. `src/lib` в `.prettierignore`.** Правило для байтов tt зацепило и `src/lib/kit`, а это оригинальный код.
  Импорты `transition.ts:49-53` не отформатированы. Нужно исключение `!src/lib/kit`.

## 1. Соответствие tt

| Фича                                        | Вердикт                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nextKey`                                   | Совпадает. Ключ 0 не рендерится заранее (tt: `if (nextKey)`). Слайд остаётся после keep-alive и `shouldCleanup`: в tt его заново добавляет `rendersRef[nextKey] = children` на каждом render. Класс `-inactive` слайд получает сразу, в том числе во время анимации. В tt в этом случае он остаётся вовсе без класса до следующего прохода, так что у kit вариант лучше                                                                                                                          |
| `slideOptimized` / `Rtl`                    | Последовательность как в `performSlideOptimized`: класс контейнера, `transition: none` и стартовые `transform`, forced reflow (`offsetWidth` в фазе forced-reflow), снятие `-active` с `from`, ±100%. Rtl зеркалит направление. Конец: у `from` `transition: none` и `transform: ''`. Сброс при смене имени optimized ↔ обычное совпадает. Отклонение: класс контейнера ставится сразу, как только есть второй (заранее отрендеренный) слайд. Без этого слайд `nextKey` был бы виден. Обосновано |
| Fallback 1 с для optimized                  | Обосновано: у tt нет fallback, и `transitionend`, который не пришёл (`display: none`, reduced-motion CSS), вешает шаг. Запас большой: `--slide-transition` 0,3–0,45 с                                                                                                                                                                                                                                                                                                                            |
| Watched slide `reveal` / `slideFadeAndroid` | Совпадает с `watchedNode` tt, без `from` шаг заканчивается сразу. e2e проверяет конец меньше чем за 800 мс, то есть без fallback                                                                                                                                                                                                                                                                                                                                                                 |
| Пары `onStart` / `onStop`                   | При supersede kit соблюдает пары строже tt: tt не вызывает `onStop` для перебитого шага. Было и раньше, задокументировано в kit. При откате свайпа `onStop` вызывается ровно один раз, обратное переключение без анимации и без callbacks, как в tt (`isSwipeJustCancelled`). При dispose `onStop` нет, как и при unmount в tt                                                                                                                                                                   |
| Классы и их порядок                         | `Transition_slide`, затем токены `slideClass`, затем состояние. Контейнер: `Transition-${name}[Backwards]`. При мгновенном переключении kit снимает класс анимации с контейнера, tt оставляет его висеть. Задержка 50 мс после `animationend` такая же, как у tt                                                                                                                                                                                                                                 |
| Понижение blocking на время свайпа          | Обосновано. Новый non-blocking `begin` идёт до `end` blocking, поэтому `isAnimating` не прерывается. Store-парковка во время жеста **не** снимается: store-gate смотрит на `isAnimating`, а не на blocking. Скачка layout посреди жеста нет. Понижение происходит в том же apply, что и `begin`, и запарковаться ничего не успевает. При release scope снова становится blocking, на `touchcancel` тоже (через `captureEvents`). Не восстанавливается в I1 и после supersede (I2)                |
| Палец отпущен до первого measure            | Обосновано, иначе шаг висел бы вечно. Мелочь с easing описана в m2                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `extractPositionFromMatrix`                 | Обоснованный фикс: tt режет фиксированные 7 символов, ломается на `matrix3d(` и на `none`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `shouldRestoreHeight`                       | Высота восстанавливается при settle, в том числе после мгновенного обратного переключения из-за отката свайпа. См. m5                                                                                                                                                                                                                                                                                                                                                                            |
| Клавиатура / back во время свайпа           | Программная смена ключа при пальце на экране отдаёт новый шаг тому же жесту, как в tt. Утечка в этом случае описана в I2, проба C                                                                                                                                                                                                                                                                                                                                                                |

Молча потерянного поведения нет. Потерян только cleanup свайпа при supersede (I2). Кроме того, отличие tt в onEnd
инерции (отмена клиента при новом шаге с `withSwipeControl`) сознательно не перенесено, и это правильно.

## 2. Свайп

- **Математика и пороги.** Байты tt: старт с 10 px по доминирующей оси, ось фиксируется (горизонтальный свайп после
  вертикального игнорируется, приоритет у скролла), полоса 20 px у края на iOS исключена, прогресс равен
  `clamp(offset / distance, 0, 1)`, а `distance` берётся в measure из `getComputedStyle` и `offsetWidth`. Инерция
  длится 300 мс с easeOutCubic. Проблемы: связка порогов 10 / 15 (I1) и равный прогресс (m1).
- **Touch и pointer.** Есть только touch (iOS) и mouse. Свайп с управлением включается только на iOS, как в tt.
- **Passive.** `touchstart` на body пассивный (без `isNotPassive`), `touchmove`, `touchend` и `touchcancel` на target
  тоже. Обработчиков, которые блокировали бы скролл, нет.
- **Вертикальный скролл.** Решается фиксацией оси и `overflow: hidden` на `selectorToPreventScroll`. Запись ушла в
  mutate, но попадает в тот же rendering opportunity, так что регрессии нет.
- **Несколько пальцев:** m6. **Свайп во время шага:** новый шаг перебивает старый, у старого остаётся fallback 1 с,
  с этим всё в порядке. **Dispose посреди drag и посреди инерции:** покрыты тестами, callbacks не вызываются. Но в
  случае supersede, а не dispose, есть I2.

## 3. Перф (замерено)

Chromium, harness `slideLayers` 390 × 300, 40 событий move через CDP, `Performance.getMetrics`, CPU ×4:

| Метрика на одно событие move | Значение                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Script                       | 0,43 мс                                                                                                    |
| Style recalc                 | 0,38 мс; 4,15 пересчёта (в простое 1,0 на два кадра, то есть около 3 лишних: 2 × `getAnimations()` и кадр) |
| Layout                       | 0,025 пересчёта на событие (в простое 0,075 на два кадра), ≈0 мс                                           |

- **Работа за кадр.** Во время drag фазы frameact не участвуют: `currentTime` записывается прямо в обработчике
  (Web Animations, не DOM). Инерция даёт одну measure-задачу на кадр. Layout thrash нет: на каждое движение
  только чтение style, layout не пересчитывается. `will-change` не используется и не нужен: transform анимирует CSS.
- **Аллокации на событие.** Объект offsets, `map` и два массива `getAnimations`, `flat`, плюс замыкание
  `requestMutation`, если на iOS задан selector. GC это не нагружает. Улучшения описаны в m3.
- **Утечки.** Пробовал два вида циклов, mount → свайп с commit → dispose и mount → программный шаг → dispose, в два
  раунда по 60. Рост кучи после 20/40/60 циклов: свайп 101/135/169 KB и 28/29/98 KB, программный шаг 85/1189/1211 KB
  (разовый скачок в DEV) и 7/34/42 KB. Линейного роста, который можно было бы приписать свайпу, нет. Пробный прогон
  `expectNoLeak` (30 runs, warmup 5) один раз показал 1230 KB, и это тот же разовый скачок DEV. Утечечные пробы лучше
  гонять на prod-сборке или с warmup 10+. Слушатели снимаются: stop у `captureEvents` убирает `touchstart` с body, а
  release убирает слушателей с target.
- **Бандл:** +1,3 KiB подтверждено, разбор в m4.
- **Шаг.** `findSlide`, `indexOf`, splice по 2–3 записям, по одному объекту `Step` и паре замыканий на шаг. В DEV
  `transition.step` занял 8,8 мс на первом шаге auth (`Slow effect run` в логе e2e), но в нём живёт создание содержимого
  слайда, и это не ново.

## 4. Фазы

Stricterdom во время свайпа чист: так в unit-тесте с канарейкой, и e2e свайпа под strict-фикстурой тоже чист в
Chromium. Чтения (`getComputedStyle`, `offsetWidth`) делаются в measure, запись `animationTimingFunction` в mutate, а
cleanup идёт через `requestMutation`. Две оговорки, обе как в tt:

1. `allowSwipeControlForTransition` вызывается в mutate и сразу делает `getAnimations()` и `getKeyframes()`. Это
   синхронный пересчёт style (не layout) после записи классов. Происходит только при активном свайпе, один раз на шаг.
2. Инерция и ветка m2 пишут `currentTime` и `play()` в measure. Это состояние Web Animations, а не DOM, и stricterdom
   его не видит.

## 5. Тесты

Мутации, по одной на прогон `transition.test.ts` из 40 тестов:

| Мутация                                       | Поймана?     |
| --------------------------------------------- | ------------ |
| M1 убран `onStop` при откате свайпа           | да (1)       |
| M2a `swipeThreshold` 10 → 5                   | **нет**      |
| M2b `swipeThreshold` 10 → 20                  | да (7)       |
| M3 убрано понижение blocking                  | да (1)       |
| M4 убрано восстановление blocking при release | да (8)       |
| M5 fallback 1 с оставлен в режиме свайпа      | да (1)       |
| M6 всегда ждать `to`                          | да (3)       |
| M7 заранее рендерить ключ 0                   | да (1)       |
| M8 равный прогресс считается движением вперёд | **нет** (m1) |
| M9 убран `swipe.dispose()` при supersede      | **нет** (I2) |
| M10 убрана ветка «палец отпущен до measure»   | да (1)       |

Тесты осмысленные. Математика прогресса проверяется точными значениями `currentTime` (0,25 / 0,5 / clamp), пропущенный
`onStop` ловится, и e2e тоже его поймает. Не хватает: порога снизу (движение на 9 px не начинает свайп),
вертикального drag, полосы у края на iOS, `touchcancel`, отпускания на 12 px (I1), unmount владельца посреди drag,
supersede во время инерции (I2). e2e работает только в Chromium через CDP-touch, а путь свайпа iOS-only. Целевой движок
здесь WebKit: перемотка анимации на паузе и `animationend` в нём стоит проверить вручную на устройстве.

**Харнесс** (`src/lib/kit/testing/dom.ts`, `beforeAll` с реальным rAF и `setTimeout(0)`). Его используют 26 тестовых
файлов, каждый ждёт до одного кадра jsdom (≤16 мс), в сумме около 0,4 с. Побочных эффектов на текущих тестах нет:
весь прогон зелёный. Скрытое ограничение такое: файл, который подделывает таймеры или rAF на уровне модуля (до хука),
повесит `beforeAll`. Корень проблемы в том, что `windowSize` при импорте бронирует кадр на реальном rAF, а
планировщик потом не просит кадр у фейкового. Лучше бы `installFakeRaf` перехватывал уже забронированный кадр, или хотя
бы стоит записать это ограничение в `raf.ts`.

## 6. Инфраструктура: `reuseExistingServer` подхватывает чужой сервер

Все три конфига ставят `reuseExistingServer: !process.env.CI` на фиксированных портах по умолчанию: 1240, 1241, 1235.
Если на порту уже работает сервер другого worktree, Playwright молча гоняет тесты против **чужого** кода. Минимальный
фикс: переиспользование только по явному согласию плюс `--strictPort`, чтобы vite не уехал на соседний порт:

```ts
// tests/config.ts
// A server already on the port may belong to another worktree: reuse it only when asked (E2E_REUSE_SERVER=1).
export const REUSE_SERVER = !process.env.CI && process.env.E2E_REUSE_SERVER === '1';
```

```diff
 // playwright.config.ts (то же в playwright.visual.config.ts для обоих серверов и в playwright.perf.config.ts)
-    command: `pnpm exec vite --mode development --port ${DEV_PORT} --host 127.0.0.1`,
+    command: `pnpm exec vite --mode development --port ${DEV_PORT} --strictPort --host 127.0.0.1`,
-    reuseExistingServer: !process.env.CI,
+    reuseExistingServer: REUSE_SERVER,
```

При занятом порту Playwright падает сразу с «already used», без ложных результатов. Опционально можно выводить порты
по умолчанию из пути worktree, например `1300 + hash(ROOT) % 100 * 3`, чтобы параллельные worktree не мешали друг
другу без ручных `E2E_DEV_PORT`.

## Что исправить до первого потребителя свайпа

1. I1: сбрасывать `isSwipeActive` и отдавать release при `hasSwiped` без `hasMoved` и при stop владельца, плюс
   страховка на `visibilitychange`.
2. I2: cleanup стилей в `dispose()` и supersede шага со свайпом как `interrupt`.
3. m1: равный прогресс не должен менять направление. Тесты для всех трёх, с мутациями M2a, M8, M9.
