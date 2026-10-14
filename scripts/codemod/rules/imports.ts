// Last pass: swap the import lines. teact / teact-dom / fasterdom / stricterdom specifiers move to `frameact`,
// `frameact/dom`, `frameact/stricterdom`; replaced hook imports whose local is no longer referenced are dropped;
// `withGlobal` stays (it is a body call now); whatever the other rules introduced (createSignal, For, JSX, createShowTransition,
// GlobalState, lazy/loadModule…) is imported from its module. Names still imported from teact (an unmapped use) stay
// on the old line with a TODO so the file does not silently lose them.
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import { posix } from 'node:path';

import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

import { GLOBAL_STATE_TYPE } from './withGlobal.ts';

const FRAMEACT = new Set([
  'createSignal',
  'createMemo',
  'createEffect',
  'createMeasureEffect',
  'createMutationEffect',
  'createIdleEffect',
  'createRenderEffect',
  'onMount',
  'onDestroy',
  'onCleanup',
  'untrack',
  'previous',
  'currentOrPrev',
  'frozenWhile',
  'requestMeasure',
  'requestMutation',
  'requestNextMutation',
  'requestForcedReflow',
  'frameForcedReflow',
  'beginHeavyAnimation',
  'getIsHeavyAnimating',
  'onFullyIdle',
  'watchHeavyAnimation',
  'deferUntilIdle',
  'createHeavyAnimationScope',
  'provideHeavyAnimationScope',
  'rootScope',
  'createContext',
  'useContext',
  'provideContext',
  'flushSync',
  'createSelector',
  'getPhase',
  'createRoot',
  'getOwner',
  'runWithOwner',
  'onError',
]);
const FRAMEACT_DOM = new Set([
  'For',
  'ManualFor',
  'Show',
  'Switch',
  'Match',
  'Dynamic',
  'mergeProps',
  'splitProps',
  'lazy',
  'addExtraClass',
  'removeExtraClass',
  'toggleExtraClass',
  'setExtraStyles',
  'HeavyAnimationScope',
  'children',
  'Portal',
]);
const FRAMEACT_STRICTERDOM = new Set(['forceMeasure', 'forceMutation', 'suppressStrict', 'enableStrict']);
const KIT = new Set([
  'createShowTransition',
  'createMediaTransition',
  'Transition',
  'ShowTransition',
  'InfiniteScroll',
  'createScrollAnchor',
]);
const GLOBAL = new Set(['getGlobal', 'getActions', 'useGlobal', 'trackGlobal', 'withGlobal']);
const MODULE_LOADER = new Set(['loadBundle', 'Bundles']);
const EFFECT_DEPS = new Set(['depsOf']);
const TYPES = new Set(['JSX', GLOBAL_STATE_TYPE.name]);

const TEACT_SOURCE = /(?:^|\/)lib\/teact\/teact$|^@teact$/;
const TEACT_DOM_SOURCE = /(?:^|\/)lib\/teact\/teact-dom$|^@teact\/teact-dom$/;
const FASTERDOM_SOURCE = /(?:^|\/)lib\/fasterdom\/fasterdom$/;
const STRICTERDOM_SOURCE = /(?:^|\/)lib\/fasterdom\/stricterdom$/;
const GLOBAL_SOURCE = /(?:^|\/)global$/;
/** teactn's `addCallback`, `removeCallback`, `ActionOptions` live in `src/global` now (store contract §12.1). */
const TEACTN_SOURCE = /(?:^|\/)lib\/teact\/teactn$|^@teact\/teactn$/;
const HOOKS_SOURCE = /\/hooks\//;
/** Hook modules that have a primitive and are deleted (porting guide §2); their import goes when no reference is left. */
const REMOVED_HOOKS =
  /\/hooks\/(useLastCallback|usePrevious|usePreviousDeprecated|useCurrentOrPrev|useFrozenProps|usePrevDuringAnimation|useSyncEffect|useSyncEffectWithPrevDeps|useEffectWithPrevDeps|useLayoutEffectWithPrevDeps|useForceUpdate|useStateRef|useSignalEffect|useDerivedSignal|useDerivedState|useHeavyAnimation|useMountAfterHeavyAnimation|useModuleLoader|useShowTransition|useShowTransitionDeprecated|useMediaTransition|useMediaTransitionDeprecated|useEffectOnce|useSelector|useSignal)$/;

function specifierName(specifier: t.ImportDeclaration['specifiers'][number]): string {
  if (specifier.type === 'ImportSpecifier') {
    return specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
  }
  return 'default';
}

const byName = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

function relativeTo(filePath: string, target: string): string {
  const dir = posix.dirname(filePath.split('\\').join('/'));
  let rel = posix.relative(dir, target);
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

export const importsRule: Rule = {
  name: 'imports',
  description:
    'teact/teact-dom/fasterdom/hooks imports → frameact, frameact/dom, src/lib/kit; adds what the rules introduced',
  run(ctx: Ctx) {
    const program = ctx.ast.program;
    const scope = ctx.scope;
    const isReferenced = (local: string) => {
      const binding = scope.getBinding(local);
      return Boolean(binding && (binding.referencePaths.length > 0 || binding.constantViolations.length > 0));
    };

    const imports = program.body.filter((s): s is t.ImportDeclaration => s.type === 'ImportDeclaration');
    const have = new Map<string, Set<string>>(); // module -> names already imported there
    const needed = new Map<string, Set<string>>(); // module -> names to import
    const addNeeded = (module: string, name: string) => {
      if (!needed.has(module)) needed.set(module, new Set());
      needed.get(module)!.add(name);
    };
    let anchor: t.ImportDeclaration | undefined; // where the frameact block goes
    let globalImport: t.ImportDeclaration | undefined;
    let leftover = 0;

    // What the code references without a binding.
    const unbound = new Set<string>();
    ctx.program.traverse({
      Identifier(path) {
        const referenced: boolean = path.isReferencedIdentifier();
        if (!referenced && !(path.parentPath as NodePath).isTSTypeReference()) return;
        const name = path.node.name;
        if (path.scope.getBinding(name)) return;
        unbound.add(name);
      },
      JSXIdentifier(path) {
        const name = path.node.name;
        if (!/^[A-Z]/.test(name) || !(path.parentPath as NodePath).isJSXOpeningElement()) return;
        if (path.scope.getBinding(name)) return;
        unbound.add(name);
      },
      TSTypeReference(path) {
        const typeName = path.node.typeName;
        const root = typeName.type === 'TSQualifiedName' ? (typeName.left as t.Identifier) : typeName;
        if (root.type !== 'Identifier' || path.scope.getBinding(root.name)) return;
        unbound.add(root.name);
      },
    });

    for (const decl of imports) {
      const source = decl.source.value;
      if (!have.has(source)) have.set(source, new Set());
      for (const specifier of decl.specifiers) have.get(source)!.add(specifierName(specifier));

      const isTeact = TEACT_SOURCE.test(source);
      const isTeactDom = TEACT_DOM_SOURCE.test(source);
      const isFasterdom = FASTERDOM_SOURCE.test(source);
      const isStricterdom = STRICTERDOM_SOURCE.test(source);
      if (isTeact || isTeactDom || isFasterdom || isStricterdom) {
        if (!anchor) anchor = decl;
        const kept: t.ImportDeclaration['specifiers'] = [];
        for (const specifier of decl.specifiers) {
          const name = specifierName(specifier);
          const local = specifier.local.name;
          if (!isReferenced(local)) continue;
          const moved =
            (isTeact && (FRAMEACT.has(name) || FRAMEACT_DOM.has(name))) ||
            (isTeactDom && FRAMEACT_DOM.has(name)) ||
            (isFasterdom && FRAMEACT.has(name)) ||
            (isStricterdom && FRAMEACT_STRICTERDOM.has(name));
          if (moved && local === name) {
            unbound.add(name); // re-imported from its frameact module below
            continue;
          }
          kept.push(specifier);
        }
        if (kept.length === 0) {
          ctx.removeStatement(decl);
        } else if (kept.length !== decl.specifiers.length) {
          const text = kept.map((s) => ctx.text(s)).join(', ');
          const typeOnly = decl.importKind === 'type' ? 'type ' : '';
          ctx.overwrite(decl, `import ${typeOnly}{ ${text} } from '${source}';`);
          leftover += kept.length;
          ctx.todo(decl, 'teact-leftover', `still imported from teact: ${kept.map((s) => s.local.name).join(', ')}`);
        } else {
          leftover += kept.length;
          ctx.todo(decl, 'teact-leftover', `still imported from teact: ${kept.map((s) => s.local.name).join(', ')}`);
        }
        ctx.hit('importsRewritten');
        continue;
      }
      if (TEACTN_SOURCE.test(source)) {
        ctx.overwrite(decl.source, `'${relativeTo(ctx.options.filePath, 'src/global')}'`);
        ctx.hit('importsRewritten');
        continue;
      }
      if (GLOBAL_SOURCE.test(source) && decl.importKind !== 'type') {
        globalImport = decl;
        const kept = decl.specifiers.filter((s) => isReferenced(s.local.name));
        const names = new Set(kept.map(specifierName));
        for (const name of GLOBAL) if (unbound.has(name)) names.add(name);
        if (names.size === 0) ctx.removeStatement(decl);
        else if (kept.length !== decl.specifiers.length || names.size !== kept.length) {
          ctx.overwrite(decl, `import { ${[...names].sort().join(', ')} } from '${source}';`);
        }
        continue;
      }
      if (HOOKS_SOURCE.test(source) && REMOVED_HOOKS.test(source)) {
        if (decl.specifiers.every((s) => !isReferenced(s.local.name))) {
          ctx.removeStatement(decl);
          ctx.hit('hookImportRemoved');
        }
        continue;
      }
      if (
        HOOKS_SOURCE.test(source) &&
        decl.specifiers.length &&
        decl.specifiers.every((s) => !isReferenced(s.local.name))
      ) {
        ctx.removeStatement(decl);
        ctx.hit('hookImportRemoved');
      }
    }

    const kitPath = relativeTo(ctx.options.filePath, 'src/lib/kit');
    const globalTypesPath = relativeTo(ctx.options.filePath, `src/${GLOBAL_STATE_TYPE.module}`);
    const moduleLoaderPath = relativeTo(ctx.options.filePath, 'src/util/moduleLoader');
    const effectDepsPath = relativeTo(ctx.options.filePath, 'src/util/effectDeps');
    const globalPath = globalImport ? globalImport.source.value : relativeTo(ctx.options.filePath, 'src/global');
    for (const name of unbound) {
      if (GLOBAL.has(name) && !globalImport) addNeeded(globalPath, name);
      else if (FRAMEACT.has(name)) addNeeded('frameact', name);
      else if (FRAMEACT_DOM.has(name) && name !== 'Portal') addNeeded('frameact/dom', name);
      else if (FRAMEACT_STRICTERDOM.has(name)) addNeeded('frameact/stricterdom', name);
      else if (name === 'JSX') addNeeded('type:frameact/jsx-runtime', name);
      else if (name === GLOBAL_STATE_TYPE.name) addNeeded(`type:${globalTypesPath}`, name);
      else if (KIT.has(name)) addNeeded(kitPath, name);
      else if (MODULE_LOADER.has(name)) addNeeded(moduleLoaderPath, name);
      else if (EFFECT_DEPS.has(name)) addNeeded(effectDepsPath, name);
    }
    void TYPES;

    const lines: string[] = [];
    const render = (module: string, names: Set<string>) => {
      const typeOnly = module.startsWith('type:');
      const source = typeOnly ? module.slice(5) : module;
      const existing = have.get(source);
      const list = [...names].filter((name) => !existing?.has(name)).sort(byName);
      if (!list.length) return undefined;
      if (existing && existing.size) {
        // extend the existing import line
        const decl = imports.find((d) => d.source.value === source && (d.importKind === 'type') === typeOnly);
        if (decl) {
          const merged = [...new Set([...decl.specifiers.map((s) => ctx.text(s)), ...list])].sort(byName);
          ctx.overwrite(decl, `import ${typeOnly ? 'type ' : ''}{ ${merged.join(', ')} } from '${source}';`);
          return undefined;
        }
      }
      return `import ${typeOnly ? 'type ' : ''}{ ${list.join(', ')} } from '${source}';`;
    };
    const frameactBlock: string[] = [];
    for (const module of ['frameact', 'frameact/dom', 'type:frameact/jsx-runtime', 'frameact/stricterdom']) {
      const names = needed.get(module);
      if (!names) continue;
      const line = render(module, names);
      if (line) frameactBlock.push(line);
    }
    if (frameactBlock.length) {
      const at = anchor ? ctx.lineStart(anchor.start!) : imports[0] ? ctx.lineStart(imports[0].start!) : 0;
      ctx.ms.prependLeft(at, `${frameactBlock.join('\n')}\n${anchor ? '' : '\n'}`);
      ctx.hit('importsAdded', frameactBlock.length);
    }
    for (const [module, names] of needed) {
      if (module.startsWith('frameact') || module === 'type:frameact/jsx-runtime') continue;
      const line = render(module, names);
      if (!line) continue;
      lines.push(line);
    }
    if (lines.length) {
      // after the `global` import (types / lib group), else after the frameact block / last import
      const after = globalImport ?? anchor ?? imports[imports.length - 1];
      if (after) ctx.ms.appendRight(ctx.lineEnd(after.end!), `${lines.join('\n')}\n`);
      else ctx.ms.prependLeft(0, `${lines.join('\n')}\n`);
      ctx.hit('importsAdded', lines.length);
    }
    void leftover;
  },
};
