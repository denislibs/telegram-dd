import { frameact } from 'frameact/vite';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, normalizePath, type UserConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import buildGitInfoPlugin from './plugins/gitInfo.ts';
import mockClientAssetsPlugin from './plugins/mockClientAssets.ts';
import packageJson from './package.json' with { type: 'json' };

// Ported from telegram-tt's vite.config.ts. Dropped: webpack/babel-react leftovers, bundle-stats/visualizer reports,
// watch-and-run codegen (lang/icons/gramjs:tl are run by hand until those assets are ported).
const DIR_NAME = dirname(fileURLToPath(import.meta.url));
const PRODUCTION_URL = 'https://web.telegram.org/a';
const { version: APP_VERSION } = packageJson;

const DEV_SERVER_WATCH_IGNORES = ['**/.cache/**', '**/dist/**', '**/tauri/target/**', '**/reference/**'];
const IMAGE_ASSET_RE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '');
  const appEnv = env.APP_ENV || (mode === 'development' ? 'development' : 'production');
  const appMockedClient = env.APP_MOCKED_CLIENT || '';
  const defaultAppTitle = `Telegram${appEnv !== 'production' ? ' Beta' : ''}`;
  const baseUrl = env.BASE_URL || PRODUCTION_URL;
  const appTitle = env.APP_TITLE || defaultAppTitle;
  const isProductionApp = appEnv === 'production';
  const csp = buildCsp(appEnv);
  const isDevelopmentMode = mode === 'development';
  // `TG_TELEGRAM_API_*` is the canonical name (see .env.example); telegram-tt's unprefixed names are accepted too.
  const telegramApiId = env.TG_TELEGRAM_API_ID || env.TELEGRAM_API_ID || '';
  const telegramApiHash = env.TG_TELEGRAM_API_HASH || env.TELEGRAM_API_HASH || '';
  const { HTTPS_CERT_PATH: httpsCertPath = '', HTTPS_KEY_PATH: httpsKeyPath = '', HEAD: head = '' } = env;

  if (appEnv !== 'test' && (!telegramApiId || !telegramApiHash)) {
    // telegram-tt throws here; we only warn so that `pnpm build` and the UI-less skeleton work without credentials.
    // eslint-disable-next-line no-console
    console.warn('[tg] TG_TELEGRAM_API_ID / TG_TELEGRAM_API_HASH are not set: copy .env.example to .env.local.');
  }

  // Values for the `%TG_*%` placeholders in index.html and `import.meta.env.TG_*` (envPrefix below).
  setProcessEnv({
    TG_APP_ENV: appEnv,
    TG_APP_MOCKED_CLIENT: appMockedClient,
    TG_APP_NAME: env.APP_NAME || '',
    TG_APP_TITLE: appTitle,
    TG_PUBLIC_URL: baseUrl,
    TG_CSP: csp,
    TG_APPLE_ICON: isProductionApp ? 'apple-touch-icon' : 'apple-touch-icon-dev',
    TG_MAIN_ICON: isProductionApp ? 'icon-192x192' : 'icon-dev-192x192',
    TG_MANIFEST: isProductionApp ? 'site.webmanifest' : 'site_dev.webmanifest',
    TG_TELEGRAM_API_ID: telegramApiId,
    TG_TELEGRAM_API_HASH: telegramApiHash,
    TG_TEST_SESSION: env.TEST_SESSION || '',
  });

  return {
    base: './',
    envPrefix: ['VITE_', 'TG_'],
    assetsInclude: ['**/*.tgs'],
    optimizeDeps: {
      exclude: ['temml'],
      // Dependencies of the API worker and of lazily imported modules are otherwise discovered while the page runs:
      // the dev server then re-optimizes, answers 504 ("Outdated Optimize Dep") and reloads, which fails a cold e2e run.
      include: [
        '@cryptography/aes',
        '@tauri-apps/api/core',
        'async-mutex',
        'colorjs.io/fn',
        'fflate',
        'idb-keyval',
        'qr-code-styling',
        'tweetnacl',
      ],
    },
    define: {
      APP_VERSION: JSON.stringify(APP_VERSION),
    },
    resolve: {
      tsconfigPaths: true,
      alias: [
        ...(appMockedClient === '1'
          ? [
              {
                find: /^(?:\.\/client|(?:\.\.\/)*lib\/gramjs\/client)\/TelegramClient$/,
                replacement: resolve(DIR_NAME, 'src/lib/gramjs/client/MockClient.ts'),
              },
            ]
          : []),
      ],
    },
    css: {
      modules: {
        localsConvention: 'camelCase',
        generateScopedName: isProductionApp ? '[hash:base64:8]' : '[name]__[local]',
      },
    },
    server: {
      host: '0.0.0.0',
      port: 1234,
      strictPort: true,
      headers: {
        'Content-Security-Policy': csp,
        'Service-Worker-Allowed': '/',
      },
      https: getHttpsConfig(httpsCertPath, httpsKeyPath),
      watch: {
        ignored: DEV_SERVER_WATCH_IGNORES,
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      assetsInlineLimit: (filePath) => (IMAGE_ASSET_RE.test(filePath) ? false : undefined),
    },
    worker: {
      // The MockClient runs in the API worker, whose bundle is built with these plugins, not with the main ones: the `media`
      // scenario must be bundled there (plugins/mockClientAssets.ts).
      plugins: () => (appMockedClient === '1' ? [mockClientAssetsPlugin()] : []),
      // The GramJS API worker is a module worker (`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`).
      format: 'es',
      rolldownOptions: {
        output: {
          entryFileNames: '[name]-[hash].js',
        },
      },
    },
    plugins: [
      // frameact() must stay first: it owns the JSX transform.
      frameact(),
      // The `media` scenario of the mocked client is bundled in production builds too (perf gates, `pnpm perf:compare`).
      ...(appMockedClient === '1' ? [mockClientAssetsPlugin()] : []),
      buildGitInfoPlugin({
        appEnv,
        head,
        isDevelopmentMode,
        rootDir: DIR_NAME,
      }),
      viteStaticCopy({
        targets: [
          // Opus decoder wasm used by the voice-message player (next step: UI). Emoji sprites from
          // node_modules/emoji-data-ios/img-apple-{64,160} are copied the same way once the emoji UI is ported.
          {
            src: normalizePath(resolve(DIR_NAME, 'node_modules/opus-recorder/dist/decoderWorker.min.wasm')),
            dest: 'assets',
            rename: { stripBase: true },
          },
        ],
      }),
    ],
  };
});

function setProcessEnv(env: Record<string, string>) {
  Object.entries(env).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

function buildCsp(appEnv: string) {
  return `
  default-src 'self';
  connect-src 'self' wss://*.web.telegram.org blob: http: https: wss: ${appEnv === 'development' ? 'ipc:' : ''};
  script-src 'self' 'wasm-unsafe-eval'
    https://t.me/_websync_ https://telegram.me/_websync_ https://telegram.dog/_websync_;
  worker-src 'self'${appEnv === 'development' ? ' blob:' : ''};
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  img-src 'self' data: blob: https://ss3.4sqi.net/img/categories_v2/;
  media-src 'self' blob: data:;
  object-src 'none';
  frame-src http: https:
    bitkeep: bnc: bybitapp: echooo: imtokenv2: mytonwallet-tc:
    nicegram-tc: safepal-tc: tonkeeper-pro-tc: tonkeeper-tc:;
  base-uri 'none';
  form-action 'none';`
    .replace(/\s+/g, ' ')
    .trim();
}

function getHttpsConfig(httpsCertPath: string, httpsKeyPath: string) {
  if (!httpsCertPath || !httpsKeyPath) return undefined;

  return {
    cert: readFileSync(httpsCertPath),
    key: readFileSync(httpsKeyPath),
  };
}
