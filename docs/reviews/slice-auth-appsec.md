# AppSec-ревью auth-слайса (`port/auth`, `origin/main..HEAD`)

Инструмент: скилл `appsec-review` (frameact) + `references/checklist.md`. Эталон: `reference/telegram-tt` (tt@090e38f),
frameact — сабмодуль `src/vendor/frameact` (3e8787c). PoC запускались из одноразовой gitignored-папки `.cache/appsec-poc/`
внутри worktree: vitest (jsdom, свой конфиг поверх `vite.config.ts`) и Playwright (dev-сервер с mocked client на
отдельном порту). Prod-сборка (`vite build` без env, то есть `APP_ENV=production`) лежала в `.cache/appsec-prod/`.
После прогона всё удалено, в коммит не попало.

Модель угроз для этого слайса. Недоверенные данные на auth-экранах: строки lang pack с сервера (и закэшированные в IDB),
список стран (`help.getCountriesList`), подсказка 2FA (`auth.hint`), ключи ошибок сервера, QR-токен, имена/телефоны
других аккаунтов из multiaccount-хранилища. Секреты: номер телефона, код, пароль 2FA, QR-токен. Отдельно проверено, что
браузерные гейты на mocked client не попадают в prod.

## Итог

Блокирующих находок нет. В app-коде диапазона нет ни одного HTML-sink на запись: `innerHTML` встречается один раз и
только на **чтение** (`escapeHtml` в `renderText`, запись идёт через `innerText`). Весь текст, включая строки lang pack
с `**markdown**` и переменными, попадает в DOM текстовыми узлами. URL-атрибуты защищены двумя слоями: tt-шным
`ensureProtocol` и URL-политикой frameact. Это строже, чем в tt: teact писал `href` как есть. Пароль, код, телефон и
QR-токен не попадают ни в URL, ни в localStorage/sessionStorage/IDB, ни в консоль (проверено PoC в браузере). В prod-сборке
нет MockClient, `window.getGlobal/getActions/getMirror`, stricterdom-рекордера и DEBUG-логов. Найдено одно Low (пароль
остаётся в скрытом слайде, так же в tt), одно Low из tt (`$`-паттерны в `replaceAll` у локализации), остальное Info и
рекомендации на будущие слайсы.

## Находки

1. **[Low, как в tt] После отправки пароль 2FA остаётся в DOM в скрытом предыдущем слайде** — `src/components/auth/Auth.tsx:88-95`, `src/components/common/PasswordForm.tsx:48`, `:121-138`
   - Суть: `<Transition>` в `Auth` идёт без `shouldCleanup`. Kit, как и tt, держит живыми активный и **предыдущий**
     слайд (`src/lib/kit/transition.ts:346-347`). После `WaitPassword → WaitRegistration` компонент `AuthPassword`
     остаётся смонтированным: `<input id="sign-in-password">` подключён к документу, и в его `value` лежит пароль.
     Так же при возврате с пароля на телефон и пока не наступит следующий шаг. Очищается только при переходе
     `App` → `Main` (там `shouldCleanup`).
   - PoC (Playwright, `secrets.spec.ts`): на экране регистрации `#sign-in-password` найден с `connected: true`,
     `value: 'S3cr3t-PW-xyz'`; на `Main` input'ов нет, в `outerHTML` пароля нет.
   - Сравнение с tt: в tt то же самое. `Transition.tsx:119-123` сохраняет `rendersRef.current[prevActiveKey]`, а `Auth`
     в tt тоже без `shouldCleanup`, поэтому инстанс `AuthPassword` со стейтом `password` переживает шаг. Портом не внесено.
   - Эксплуатируемо: удалённо нет. Значение читает любой скрипт в origin (расширение, XSS в другом месте),
     DOM-снимки/инструменты записи сессии и a11y-деревья, пока пользователь на экране регистрации.
   - Как исправить (дёшево, визуально ничего не меняется): `shouldCleanup` у `Transition` в `Auth.tsx` (kit выкинет
     уходящий слайд после завершения шага) или `shouldResetValue={state() !== 'authorizationStateWaitPassword'}` у
     `PasswordForm` в `AuthPassword`.

2. **[Low, как в tt] `processTranslation` подставляет переменные через `String.prototype.replaceAll(str, str)`, поэтому `$'`, `` $` ``, `$&` в значении интерпретируются** — `src/util/localization/index.ts:418`
   - PoC (vitest): `lang('LimitReachedFolders', { limit: "$'" })` возвращает строку, в которую хвост шаблона вставлен
     второй раз: `…limit of **** folders. You can double … Premium**.** folders. You can double …`. В advanced-пути
     (`withNodes`) подстановка идёт через `split`, и там `$'` выводится буквально.
   - Сценарий: как только в обычный `lang(key, { name })` попадёт контент (имя пользователя, название чата, текст
     кнопки бота в следующих слайсах), автор контента сможет переставлять и дублировать текст системной строки. Это
     подмена текста, не XSS: результат уходит в текстовый узел или атрибут. В auth-экранах переменные задаёт само
     приложение (`AuthContinueOnThisLanguage` и т.п.), так что сейчас это не эксплуатируется.
   - Файл байт-в-байт совпадает с tt (`diff` пустой). Портом не внесено.
   - Как исправить: `result.replaceAll(`{${key}}`, () => valueAsString)`. Функция-замена не интерпретирует `$`.
     Лучше отправить и в upstream tt.

3. **[Info] HTML-фильтры `renderText` (`escape_html`, `emoji_html`, `br_html`, `simple_markdown_html`) во frameact некуда применить безопасно, и `simple_markdown_html` сам ничего не экранирует** — `src/components/common/helpers/renderText.tsx:57-79`, `:315`
   - Сейчас: в слайсе ни один вызов не использует `*_html`. PoC: строки, которые они возвращают, frameact рендерит как
     текст (`<img …>` виден буквами и не исполняется). Опасного sink у этих строк сейчас нет.
   - Риск для следующих слайсов (composer, `renderTextWithEntities` с `shouldRenderAsHtml`, `jsxToHtml`): в tt они
     уходят в `dangerouslySetInnerHTML`/`innerHTML` contenteditable. При порте это будет явный `innerHTML=`/`prop:innerHTML`,
     то есть мимо политики frameact. `simple_markdown_html` оборачивает сырой текст в `<b>${…}</b>`, а `emoji_html`
     подставляет `alt="${emoji}"`. Безопасно только когда первым в цепочке стоит `escape_html`, как это всегда делает tt.
   - Рекомендация: при порте composer'а завести один helper (например `renderHtmlForComposer(text)`), который сам
     ставит `escape_html` первым и единственный пишет в `innerHTML`. Добавить грепаемый гейт: `innerHTML`/`prop:innerHTML`
     в `src/` разрешён только в этом helper'е.

4. **[Info, как в tt] В самом приложении нет защиты от clickjacking** — `index.html:26`, `vite.config.ts` (`buildCsp`)
   - CSP задаётся `<meta http-equiv>`. В meta браузер игнорирует `frame-ancestors`, а `X-Frame-Options` в meta не
     существует. Значит, от встраивания во фрейм защищает только хостинг. Комментарий в `public/compatTest.js:45`
     ("server forbids iframe embedding") подтверждает, что у tt это делает сервер. CSP совпадает с tt байт-в-байт,
     `script-src 'self'` блокирует инлайн-скрипты (хорошая страховка для любых будущих HTML-sink).
   - Для auth это UI-redress на кнопках «Войти по номеру», «Passkey», чекбоксе «Оставаться в системе». Секреты из фрейма
     не читаются, риск низкий.
   - Рекомендация: в конфиге деплоя (и в `server.headers`/`preview.headers` для паритета) отдавать
     `Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options: DENY`. Задокументировать в README деплоя.

5. **[Info] Mocked client и DEV-код в prod: проверено prod-сборкой, всё вырезано; гейт сборки держится только на env** — `vite.config.ts:82`, `src/config.ts:19`, `src/global/index.ts:393-399`
   - `vite build` (production) → `grep` по всем чанкам и воркерам (`index`, `auth`, `main`, `worker-*`, `index.worker-*`,
     `sharedState.worker-*`): нет `MockClient`/`createMocked*`/`mockData`; нет присваиваний `getActions=`/`setGlobal=`/
     `getMirror=`; нет `__strictViolations`, stricterdom-сообщений, `fake-indexeddb`; нет `>>> INIT`/`>>> START SYNC`;
     ветка `IS_MOCKED_CLIENT → auth.state = 'authorizationStateReady'` удалена. `console.*` в главном чанке: 3 вызова,
     все логируют объект ошибки. Гейты производительности собирают с `APP_ENV=test` в `.cache/dist-e2e`, а не в `dist`.
   - Остаётся: alias на `MockClient.ts` включается по одному `APP_MOCKED_CLIENT === '1'` при любом `APP_ENV`, как и в tt.
     Если переменная утечёт в окружение prod-сборки, задеплоится клиент, который «залогинен» в фейковые данные.
     Рекомендация: в `vite.config.ts` падать при `appEnv === 'production' && appMockedClient === '1'`.
   - Как и в tt: `sourcemap: true` публикует `.map` вместе с prod. Утечки секретов нет (исходники GPL и так открыты), но
     это стоит решить осознанно. В DEBUG-сборках (`APP_ENV=staging/test`) `window.getGlobal()` отдаёт `auth.qrCode.token`.

6. **[Info] `TLottie`: inert-воркер работает и в prod, не только под `APP_ENV=test`** — `src/lib/tlottie/TLottie.ts:46-49`
   - Отступление от tt сделано для e2e, но не ограничено `APP_ENV=test`. Если в prod медиа-воркеры не стартовали,
     анимация молча остаётся пустой, хотя в tt была бы видимая ошибка. Это маскирует ошибку, безопасности не касается.
     Рекомендация: включать inert только при `APP_ENV === 'test'` или один раз вызывать `handleError`.

7. **[Info, frameact upstream] Линт компилятора `STRING_HANDLER` даёт ложное срабатывание на строковых литералах** — `src/vendor/frameact/src/vite/index.ts:74`
   - Регулярка сканирует исходник целиком и предупредила про `onerror="…" is a static string attribute` на TS-константе
     `'<img src=x onerror="…">'` из PoC. В prod-сборке слайса предупреждений нет. Риск только в том, что шумное
     предупреждение приучит его игнорировать. Предложить upstream проверять, что совпадение стоит в JSX-контексте
     (как уже сделано в `insideHandlerAttribute` для другого правила).

Проверено и чисто:

- **Перечень sink'ов (весь app-код диапазона + prod-бандл).** Запись HTML: нет (`innerHTML`/`outerHTML`/
  `insertAdjacentHTML`/`srcdoc`/`document.write`/`createContextualFragment`/`DOMParser` в `src/` вне вендора не встречаются,
  кроме чтения в `renderText.tsx:100`). В prod-бандле `innerHTML` встречается 4 раза: `template()` frameact
  (статические строки компилятора), чтение в `escapeHtml`, `qr-code-styling._clearContainer` (`= ''`), `public/compatTest.js:48`
  (константа, совпадает с tt). Прочие sink'и: `style.cssText` в `useMenuPosition.ts:96,100` (числа из измерений),
  `img.src` в `imageResize.ts` (blob URL), `setAttribute` в `svgController.ts` (константы), `location.href`/`replace`/`assign`
  в `App.tsx:80`, `backNavigation.ts:16`, `AuthPhoneNumber.tsx:243` (URL слотов аккаунтов того же origin; `navigateBack`
  разрешает referrer только того же origin и pathname, как в tt). Spread'ы: `{...rest}` в `Transition`/`AnimatedIcon`/
  `Icon`/`*.async`/`Checkbox` идут в компоненты, `{...restProps}` в `OptimizedVideo` идёт на `<video>` из props
  приложения, недоверенных объектов там нет. Строковых `on*=` и `javascript:` в JSX нет. Prod-сборка без предупреждений
  линта frameact.
- **URL-политика (PoC vitest).** `SafeLink` для `javascript:alert(1)`, `JaVaScRiPt:`, `\tjava\nscript:`,
  `javascript://%0aalert(1)`, `data:text/html,…`, `vbscript:` → `ensureProtocol` превращает в `https://<payload>`
  (безвредно), `tg://` и `https://` проходят как есть. Голый `<a href={…}>` с теми же значениями: frameact снимает
  атрибут (`href === null`) и в DEV пишет `refused an unsafe URL`. Ссылки из `renderText(['links'])` и `Notification`
  идут через `SafeLink`.
- **Локализация (PoC).** Строка pack'а с `**…**` и переменной `<img src=x onerror=…>**x**` через
  `withNodes`/`withMarkdown`: в DOM `<b>&lt;img …&gt;**x**</b>`, `<img>` нет, markdown в переменной не применяется
  (подстановка идёт после markdown). `readStrings` разбирает только встроенный fallback. `localization/index.ts` совпадает
  с tt, `format.tsx` отличается только геттером стрелки (DOM-узел нельзя переиспользовать).
- **Пароль.** `type="password"`, `autocomplete="current-password"` (`one-time-code` при `shouldDisablePasswordManager`,
  `one-time-code webauthn` при passkey), у формы `autocomplete="off"`, `maxLength=256`, как в tt. Пароль не пишется в
  global (`setAuthPassword` → `callApi('provideAuthPassword')`). PoC после полного флоу до `Main`: в localStorage,
  sessionStorage и во всех базах IndexedDB нет ни пароля, ни кода, ни номера; в 32 сообщениях консоли (DEV) ни одного
  совпадения. Сообщения stricterdom содержат только тег, `id`/`class` (в кавычках, обрезанные) и **имя** атрибута
  (`describeTarget`, `stricterdom.ts:50-62`, `:346`). Значения туда не попадают, а `input.value` — свойство, его
  MutationObserver не видит. `describeNode` выводит имена signal/effect. Привязки `use:value` хранятся в `WeakMap`.
  `window.__strictViolations` есть только в DEV.
- **Телефон и код.** URL весь флоу остаётся `/`, hash не меняется. В хранилищах и консоли номера и кода нет. Код
  отправляется автоматически на 5-й цифре, как в tt.
- **QR-токен.** Попадает только в `qrCode.update({ data })` и кодируется в пути SVG. PoC: в `outerHTML`, хранилищах,
  консоли и URL токена нет. `data-stricterdom-ignore` на контейнере — более узкое отступление, чем глобальный
  `disableStrict()` на 50 ms в tt.
- **Тайминг и защита от двойной отправки.** `handleSubmit` в `AuthPhoneNumber` и `PasswordForm` проверяет `isLoading`.
  `Button` читает `props.isLoading`/`disabled` в момент клика, а не при привязке. Лимиты частоты ставит сервер
  (`FLOOD_WAIT`), как в tt.
- **Prototype pollution.** `phoneNumberSlots` (`acc[phone] = …`) строится по телефонам из локальной multiaccount-информации.
  Других объектов, индексируемых контентом, в слайсе нет.
- **ReDoS.** `RE_LINK` (`renderText` 'links') на 100 000 символах `aaaa…` и `a.a.…`: 92/105 ms в jsdom, растёт линейно.
- **Ошибки.** Действия не логируют payload (`[frameact/store] action "<name>" failed`, `[global] Action "<name>"…`).
  `readStrings` выводит строку fallback-pack'а только при ошибке разбора и только в DEBUG.

## Зависимости и supply chain

`pnpm-lock.yaml` в диапазоне не менялся, в `package.json` добавлен только скрипт `slice:inventory`. `pnpm audit --prod`:
«No known vulnerabilities found». `qr-code-styling ^1.9.2` уже был в зависимостях (как в tt). Вендоренные бинарники и
воркеры байт-в-байт совпадают с tt@090e38f: `tlottie.wasm`, `tlottie-no-simd.wasm`, `tlottie.worker.ts`,
`mediaWorker/index.worker.ts`, `offscreen-canvas.worker.ts`, `fastBlur.js`, `PostMessageConnector.ts`,
`createPostMessageInterface.ts`, `launchMediaWorkers.ts`, `icons.woff2`. `TLottie.ts` отличается только импортом
планировщика и inert-воркером (находка 6). `fake-indexeddb` — devDependency, импортируется только в `src/dev/vitestSetup.ts`,
в бандле его нет. `scripts/slice/inventory.ts` вызывает `execFileSync('git', [...])` без shell.
`src/styles/icons/preview.html` в сборку не попадает.

## Рекомендации для следующих слайсов

- Composer / `renderTextWithEntities` (`shouldRenderAsHtml`) / уведомления (`jsxToHtml`): единственный helper с
  `escape_html` первым, гейт на `innerHTML` в `src/` (находка 3). `renderTextWithEntities` пока заглушка и
  возвращает текст.
- Когда в `lang(key, vars)` пойдут имена и заголовки из контента, сначала исправить `replaceAll` (находка 2).
- Ссылки из сообщений и превью: оставить двойной слой (`ensureProtocol` + политика frameact). Никогда не передавать
  URL через `prop:href`: это обходит политику (`attributes.ts:19-21`).
- Деплой: `frame-ancestors 'none'` заголовком (находка 4); fail-fast на `APP_MOCKED_CLIENT` в production (находка 5).

## Вердикт

Мерж не блокируется: ни один путь не ведёт от недоверенных данных к выполнению кода, а секреты auth-флоу не уходят ни в
URL, ни в хранилища, ни в консоль. До релиза стоит сделать дешёвые правки: `shouldCleanup` у `Transition` в `Auth`
(находка 1) и функцию-замену в `processTranslation` (находка 2). Остальное — hardening деплоя и задел на composer.
