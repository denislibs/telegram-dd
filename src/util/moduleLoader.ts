// FOUNDATION STUB: lazy loading of the component bundles (`src/bundles/*`, one per app area). The bundles are lists of
// component re-exports, so they arrive with the components (T6); until then `loadBundle` resolves to an empty module.
// Copied (names and signatures) from telegram-tt src/util/moduleLoader.ts
import { createCallbackManager } from './callbacks';

export enum Bundles {
  Auth,
  Main,
  Extra,
  Calls,
  Stars,
  Editor,
  Wallet,
}

export type BundleModules<_B extends Bundles> = string;

const { addCallback } = createCallbackManager();

export function loadBundle<_B extends Bundles>(_bundleName: _B): Promise<any> {
  return Promise.resolve({});
}

export async function loadModule<B extends Bundles>(bundleName: B) {
  await loadBundle(bundleName);
}

export function getModuleFromMemory<B extends Bundles>(_bundleName: B, _moduleName: BundleModules<B>): any {
  return undefined;
}

export const addLoadListener = addCallback;
