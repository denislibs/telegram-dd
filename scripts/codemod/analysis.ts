// Shared analysis over one pass's AST: which functions are "run-once bodies" (components and hooks), how a component
// is connected through `withGlobal`, which props are callbacks, and which body bindings are reactive.
import type { Binding, NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import { calleeName, CAPITALIZED, type Ctx } from './context.ts';

export type FunctionPath = NodePath<t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration>;

export interface ConnectedInfo {
  /** The `withGlobal(...)` call. */
  call: NodePath<t.CallExpression>;
  /** The outer `withGlobal(...)(Component)` call. */
  apply: NodePath<t.CallExpression>;
  /** The `memo(...)` wrapper around it, if any. */
  memo?: NodePath<t.CallExpression>;
  mapFn?: NodePath<t.ArrowFunctionExpression | t.FunctionExpression>;
  /** `mapStateToProps` was passed as a reference, not inline. */
  mapRef?: string;
  hasActivationFn: boolean;
  activationFn?: NodePath;
  componentName: string;
  /** The text of the `withGlobal<OwnProps>` type argument, if any. */
  ownPropsType?: string;
}

export interface RunOnceBody {
  kind: 'component' | 'hook';
  name: string;
  fn: FunctionPath;
  body: NodePath<t.BlockStatement> | undefined;
  connected?: ConnectedInfo;
}

function nameOfFunction(path: NodePath): string | undefined {
  if (path.isFunctionDeclaration() && path.node.id) return path.node.id.name;
  if (path.isArrowFunctionExpression() || path.isFunctionExpression()) {
    const parent = path.parentPath;
    if (parent?.isVariableDeclarator() && parent.node.id.type === 'Identifier') return parent.node.id.name;
    if (parent?.isCallExpression()) {
      // memo(() => …) / withGlobal(…)(() => …): rare in tt; the declarator form is the norm.
      const grand = parent.parentPath;
      if (grand?.isVariableDeclarator() && grand.node.id.type === 'Identifier') return grand.node.id.name;
    }
    if (path.isFunctionExpression() && path.node.id) return path.node.id.name;
  }
  return undefined;
}

function containsJsx(path: NodePath): boolean {
  let found = false;
  path.traverse({
    JSXElement(p) {
      found = true;
      p.stop();
    },
    JSXFragment(p) {
      found = true;
      p.stop();
    },
  });
  return found;
}

function hasPropsParam(fn: FunctionPath): boolean {
  const param = fn.node.params[0];
  if (!param) return false;
  const annotation = (param as t.Identifier | t.ObjectPattern).typeAnnotation;
  if (annotation?.type === 'TSTypeAnnotation') {
    const text = JSON.stringify(annotation.typeAnnotation);
    return /Props/.test(text);
  }
  return param.type === 'ObjectPattern';
}

/** `withGlobal(...)(X)` wrappers in the module: `X -> info`. */
export function findConnected(ctx: Ctx): Map<string, ConnectedInfo> {
  const result = new Map<string, ConnectedInfo>();
  ctx.program.traverse({
    CallExpression(apply) {
      const callee = apply.get('callee');
      if (!callee.isCallExpression()) return;
      const inner = callee.node.callee;
      if (inner.type !== 'Identifier' || inner.name !== 'withGlobal') return;
      const arg = apply.node.arguments[0];
      if (!arg || arg.type !== 'Identifier') return;
      const mapArg = callee.get('arguments.0') as NodePath | undefined;
      const parent = apply.parentPath;
      const memo =
        parent?.isCallExpression() && parent.node.callee.type === 'Identifier' && parent.node.callee.name === 'memo'
          ? parent
          : undefined;
      const typeParams = (callee.node as t.CallExpression & { typeParameters?: t.TSTypeParameterInstantiation })
        .typeParameters;
      const typeArgs = (callee.node as t.CallExpression & { typeArguments?: t.TSTypeParameterInstantiation })
        .typeArguments;
      const typeArg = (typeParams ?? typeArgs)?.params[0];
      result.set(arg.name, {
        call: callee,
        apply,
        memo,
        mapFn:
          mapArg && (mapArg.isArrowFunctionExpression() || mapArg.isFunctionExpression())
            ? (mapArg as NodePath<t.ArrowFunctionExpression | t.FunctionExpression>)
            : undefined,
        mapRef: mapArg?.isIdentifier() ? mapArg.node.name : undefined,
        hasActivationFn: callee.node.arguments.length > 1,
        activationFn: callee.node.arguments.length > 1 ? (callee.get('arguments.1') as NodePath) : undefined,
        componentName: arg.name,
        ownPropsType: typeArg ? ctx.text(typeArg) : undefined,
      });
    },
  });
  return result;
}

/** Components (capitalised, JSX or a Props param) and hooks (`useX`) declared at module level. */
export function findBodies(ctx: Ctx): RunOnceBody[] {
  const bodies: RunOnceBody[] = [];
  const connected = findConnected(ctx);
  const seen = new Set<t.Node>();
  const consider = (fn: FunctionPath) => {
    if (seen.has(fn.node)) return;
    seen.add(fn.node);
    const name = nameOfFunction(fn);
    if (!name) return;
    const bodyPath = fn.get('body');
    const body = bodyPath.isBlockStatement() ? bodyPath : undefined;
    if (/^use[A-Z]/.test(name)) {
      bodies.push({ kind: 'hook', name, fn, body });
    } else if (CAPITALIZED.test(name) && (containsJsx(fn) || hasPropsParam(fn) || connected.has(name))) {
      bodies.push({ kind: 'component', name, fn, body, connected: connected.get(name) });
    }
  };
  for (const statement of ctx.program.get('body')) {
    let decl: NodePath = statement;
    if (decl.isExportNamedDeclaration() || decl.isExportDefaultDeclaration()) {
      const inner = decl.get('declaration') as NodePath | undefined;
      if (!inner || !inner.node) continue;
      decl = inner;
    }
    if (decl.isFunctionDeclaration()) consider(decl);
    else if (decl.isVariableDeclaration()) {
      for (const declarator of decl.get('declarations')) {
        const init = declarator.get('init');
        if (init.isArrowFunctionExpression() || init.isFunctionExpression()) consider(init);
        else if (init.isCallExpression()) {
          // const X = memo(() => …)
          const arg = init.get('arguments.0') as NodePath | undefined;
          if (arg && (arg.isArrowFunctionExpression() || arg.isFunctionExpression())) consider(arg);
        }
      }
    } else if (decl.isArrowFunctionExpression() || decl.isFunctionExpression()) consider(decl);
  }
  return bodies;
}

// ---------------------------------------------------------------------------------------------------------------------
// Prop kinds

export type PropKind = 'callback' | 'value';

const CALLBACK_TYPE_NAMES =
  /^(NoneToVoidFunction|AnyToVoidFunction|AnyFunction|BooleanToVoidFunction|VoidFunction)$|Function$|Handler$|Callback$/;
const CALLBACK_NAME = /^(on[A-Z]|handle[A-Z]|render[A-Z]|get[A-Z]|format[A-Z])|(Fn|Callback|Handler)$/;

function isCallbackType(node: t.TSType): boolean {
  switch (node.type) {
    case 'TSFunctionType':
      return true;
    case 'TSTypeReference':
      return node.typeName.type === 'Identifier' && CALLBACK_TYPE_NAMES.test(node.typeName.name);
    case 'TSUnionType':
      return node.types.some((member) => member.type !== 'TSUndefinedKeyword' && isCallbackType(member));
    case 'TSParenthesizedType':
      return isCallbackType(node.typeAnnotation);
    default:
      return false;
  }
}

/** Prop name -> kind, from the module's `type …Props = { … }` / `interface …Props` declarations. */
export function collectPropKinds(ctx: Ctx): Map<string, PropKind> {
  const kinds = new Map<string, PropKind>();
  const visitMembers = (members: t.TSTypeElement[]) => {
    for (const member of members) {
      if (member.type !== 'TSPropertySignature' || member.key.type !== 'Identifier') continue;
      const annotation = member.typeAnnotation?.typeAnnotation;
      kinds.set(member.key.name, annotation && isCallbackType(annotation) ? 'callback' : 'value');
    }
  };
  for (const statement of ctx.ast.program.body) {
    let node: t.Node = statement;
    if (node.type === 'ExportNamedDeclaration' && node.declaration) node = node.declaration;
    if (node.type === 'TSTypeAliasDeclaration' && /Props$/.test(node.id.name)) {
      const walk = (type: t.TSType) => {
        if (type.type === 'TSTypeLiteral') visitMembers(type.members);
        else if (type.type === 'TSIntersectionType') type.types.forEach(walk);
      };
      walk(node.typeAnnotation);
    } else if (node.type === 'TSInterfaceDeclaration' && /Props$/.test(node.id.name)) {
      visitMembers(node.body.body);
    }
  }
  return kinds;
}

export function propKind(kinds: Map<string, PropKind>, name: string): PropKind {
  return kinds.get(name) ?? (CALLBACK_NAME.test(name) ? 'callback' : 'value');
}

// ---------------------------------------------------------------------------------------------------------------------
// Binding kinds inside a run-once body

export type BindingKind =
  | 'props' // the props object (getters)
  | 'accessor' // a signal/memo accessor: read as `x()`
  | 'thunk' // a zero-arg arrow over reactive reads (an accessor made by hand or by the codemod); read as `x()`
  | 'reactive' // a plain value computed from reactive reads once (to be turned into a memo)
  | 'callback' // a function value
  | 'lang' // `useLang()` / `useOldLang()`
  | 'hook' // the result of an unmapped hook
  | 'static';

export interface Kinds {
  byName: Map<string, BindingKind>;
  bindings: Map<string, Binding>;
}

const ACCESSOR_TUPLE_HOOKS = new Set(['createSignal', 'useState', 'useFlag', 'useInfiniteScroll', 'useSignal']);
const ACCESSOR_VALUE_HOOKS = new Set([
  'createMemo',
  'previous',
  'currentOrPrev',
  'frozenWhile',
  'useMemo',
  'useDerivedState',
  'useDerivedSignal',
  'useSelector',
  'useShallowSelector',
]);
const TRANSITION_ACCESSORS = new Set(['shouldRender', 'isClosing', 'state']);
const LANG_HOOKS = new Set(['useLang', 'useOldLang']);
const REACTIVE_CALLS = new Set(['getGlobal']);

export function isFunctionNode(node: t.Node | null | undefined): boolean {
  return Boolean(node) && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression');
}

/**
 * Classify the bindings declared directly in a run-once body (and its params). Order matters: a later const may read
 * an earlier reactive one.
 */
export function classifyBindings(ctx: Ctx, body: RunOnceBody, propKinds: Map<string, PropKind>): Kinds {
  const byName = new Map<string, BindingKind>();
  const bindings = new Map<string, Binding>();
  const scope = body.fn.scope;
  const kinds: Kinds = { byName, bindings };

  const setKind = (name: string, kind: BindingKind) => {
    const binding = scope.getOwnBinding(name) ?? scope.getBinding(name);
    if (!binding) return;
    byName.set(name, kind);
    bindings.set(name, binding);
  };

  // Params: a component's first param is the props object (after the props rule it is `props` or `rawProps`/`ownProps`).
  if (body.kind === 'component') {
    const param = body.fn.node.params[0];
    if (param?.type === 'Identifier') setKind(param.name, 'props');
  }

  if (!body.body) return kinds;
  for (const statement of body.body.node.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declarator of statement.declarations) {
      const init = declarator.init;
      const id = declarator.id;
      if (!init) {
        if (id.type === 'Identifier') setKind(id.name, 'static');
        continue;
      }
      const callee = init.type === 'CallExpression' ? calleeName(init) : undefined;
      const inner = unwrapInit(init);
      if (id.type === 'ArrayPattern') {
        const first = id.elements[0];
        if (callee && ACCESSOR_TUPLE_HOOKS.has(callee)) {
          if (first?.type === 'Identifier') setKind(first.name, callee === 'useSignal' ? 'callback' : 'accessor');
          for (const element of id.elements.slice(1)) {
            if (element?.type === 'Identifier') setKind(element.name, 'static');
          }
        } else {
          for (const element of id.elements) {
            if (element?.type === 'Identifier') {
              setKind(element.name, isReactiveExpr(ctx, init, kinds) ? 'reactive' : 'static');
            }
          }
        }
        continue;
      }
      if (id.type === 'ObjectPattern') {
        const fromTransition = callee === 'createShowTransition' || callee === 'createMediaTransition';
        for (const property of id.properties) {
          if (property.type !== 'ObjectProperty' || property.value.type !== 'Identifier') {
            if (
              property.type === 'ObjectProperty' &&
              property.value.type === 'AssignmentPattern' &&
              property.value.left.type === 'Identifier'
            ) {
              setKind(property.value.left.name, isReactiveExpr(ctx, init, kinds) ? 'reactive' : 'static');
            }
            continue;
          }
          const keyName = property.key.type === 'Identifier' ? property.key.name : undefined;
          if (fromTransition) {
            const alreadyGetter = /^get[A-Z]/.test(property.value.name); // tt's `getIsClosing` signal: called as it is
            const isAccessor = keyName && TRANSITION_ACCESSORS.has(keyName) && !alreadyGetter;
            setKind(property.value.name, isAccessor ? 'accessor' : 'callback');
          } else if (callee === 'mergeProps' || callee === 'withGlobal' || callee === 'getActions') {
            setKind(property.value.name, 'static');
          } else {
            setKind(property.value.name, isReactiveExpr(ctx, init, kinds) ? 'reactive' : 'static');
          }
        }
        continue;
      }
      if (id.type !== 'Identifier') continue;
      const name = id.name;
      if (
        callee === 'mergeProps' ||
        callee === 'withGlobal' ||
        (init.type === 'TSAsExpression' &&
          init.expression.type === 'CallExpression' &&
          ['mergeProps', 'withGlobal'].includes(calleeName(init.expression) ?? ''))
      ) {
        setKind(name, 'props');
      } else if (callee && ACCESSOR_VALUE_HOOKS.has(callee)) {
        setKind(name, 'accessor');
      } else if (callee && LANG_HOOKS.has(callee)) {
        setKind(name, 'lang');
      } else if (isFunctionNode(inner)) {
        const fn = inner as t.ArrowFunctionExpression | t.FunctionExpression;
        setKind(name, fn.params.length === 0 && isReactiveExpr(ctx, fn.body, kinds) ? 'thunk' : 'callback');
      } else if (init.type === 'CallExpression' && isHookName(callee)) {
        setKind(name, 'hook');
      } else if (statement.kind === 'const' && isReactiveExpr(ctx, init, kinds)) {
        setKind(name, 'reactive');
      } else {
        setKind(name, 'static');
      }
    }
  }
  return kinds;
}

function isHookName(name: string | undefined): boolean {
  return Boolean(name) && /^use[A-Z]/.test(name);
}

/** `x as T`, `x!`, `(x)` → x. */
export function unwrapInit(node: t.Expression): t.Expression {
  let current: t.Expression = node;
  for (;;) {
    if (
      current.type === 'TSAsExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSSatisfiesExpression'
    ) {
      current = current.expression;
    } else if (current.type === 'TSTypeAssertion') {
      current = current.expression;
    } else {
      return current;
    }
  }
}

function kindOfIdentifier(path: NodePath<t.Identifier>, kinds: Kinds): BindingKind | undefined {
  const binding = path.scope.getBinding(path.node.name);
  if (!binding) return undefined;
  const known = kinds.bindings.get(path.node.name);
  if (known && known !== binding) return undefined; // shadowed
  return kinds.byName.get(path.node.name);
}

/**
 * Does evaluating `node` once read something reactive: a props member, an accessor/thunk/lang call, `getGlobal()`, or a
 * `reactive` binding? JSX subtrees are skipped (their attributes are compiled reactively), and so are function bodies
 * at the top level (a handler reads at call time), but callbacks passed to calls are entered (`items.map(…)` runs now).
 */
export function isReactiveExpr(
  ctx: Ctx,
  node: t.Node | null | undefined,
  kinds: Kinds,
  options: { valueOnly?: boolean; propKinds?: Map<string, PropKind> } = {},
): boolean {
  if (!node) return false;
  let found = false;
  const check = (path: NodePath) => {
    if (found) {
      path.stop();
      return;
    }
    if (path.isJSXElement() || path.isJSXFragment() || path.isTSType()) {
      path.skip();
      return;
    }
    if (path.isMemberExpression() || path.isOptionalMemberExpression()) {
      const object = path.get('object') as NodePath;
      if (object.isIdentifier() && kindOfIdentifier(object, kinds) === 'props') {
        const property = path.node.property;
        const name = !path.node.computed && property.type === 'Identifier' ? property.name : undefined;
        if (options.valueOnly && name && options.propKinds && propKind(options.propKinds, name) === 'callback') {
          // A callback prop read once is a function value, not a reactive value.
        } else {
          found = true;
          path.stop();
          return;
        }
      }
    }
    if (path.isCallExpression() || path.isOptionalCallExpression()) {
      const callee = path.get('callee') as NodePath;
      if (callee.isIdentifier()) {
        const kind = kindOfIdentifier(callee, kinds);
        if (
          kind === 'accessor' ||
          kind === 'thunk' ||
          kind === 'lang' ||
          (REACTIVE_CALLS.has(callee.node.name) &&
            !callee.scope.getBinding(callee.node.name)?.path.isVariableDeclarator())
        ) {
          found = true;
          path.stop();
          return;
        }
      } else if (callee.isMemberExpression()) {
        // lang.with(…), lang.formatNumber(…)
        const object = callee.get('object') as NodePath;
        if (object.isIdentifier() && kindOfIdentifier(object, kinds) === 'lang') {
          found = true;
          path.stop();
          return;
        }
      }
    }
    if (
      path.isIdentifier() &&
      !path.parentPath.isMemberExpression({ property: path.node }) &&
      !(
        path.parentPath.isObjectProperty({ key: path.node }) &&
        !path.parentPath.node.computed &&
        !path.parentPath.node.shorthand
      )
    ) {
      const kind = kindOfIdentifier(path, kinds);
      if (kind === 'reactive') {
        found = true;
        path.stop();
        return;
      }
      if (
        kind === 'lang' &&
        !path.parentPath.isCallExpression({ callee: path.node }) &&
        !path.parentPath.isMemberExpression({ object: path.node })
      ) {
        // `lang` passed around as a value (e.g. a dependency): the value itself is a function, not reactive.
      }
    }
  };
  // Run on a detached sub-path: traverse needs a NodePath, so find it through the program.
  const target = findPath(ctx, node);
  if (!target) return false;
  if (target.isFunction()) return false; // a function value is not evaluated now
  if (target.isJSXElement() || target.isJSXFragment()) return false; // bindings inside are compiled reactively
  check(target);
  if (!found) target.traverse({ enter: check });
  return found;
}

const pathCache = new WeakMap<t.Node, NodePath>();

/** The NodePath of `node` within the program (cached per node). */
export function findPath(ctx: Ctx, node: t.Node): NodePath | undefined {
  const cached = pathCache.get(node);
  if (cached) return cached;
  let result: NodePath | undefined;
  ctx.program.traverse({
    enter(path) {
      if (path.node === node) {
        result = path;
        path.stop();
      } else if (path.node.start! > node.end! || path.node.end! < node.start!) {
        path.skip();
      }
    },
  });
  if (result) pathCache.set(node, result);
  return result;
}

/** The reference paths of a body binding (reads only; writes are `binding.constantViolations`). */
export function referencesOf(binding: Binding): NodePath<t.Identifier | t.JSXIdentifier>[] {
  return binding.referencePaths.filter((p) => p.isIdentifier() || p.isJSXIdentifier());
}

/**
 * Rewrite every read of `binding` with `replacement` (`props.a`, `x()`): a shorthand property `{ a }` becomes
 * `a: replacement`, a type query (`typeof a`) and an already-called accessor are left alone.
 */
export function rewriteReads(
  ctx: Ctx,
  binding: Binding,
  replacement: string,
  options: { skipCallees?: boolean; filter?: (ref: NodePath<t.Identifier | t.JSXIdentifier>) => boolean } = {},
): number {
  let count = 0;
  for (const ref of referencesOf(binding)) {
    const parent = ref.parentPath;
    if (!parent) continue;
    if (options.filter && !options.filter(ref)) continue;
    if (parent.isTSTypeQuery() || parent.isTSTypeReference()) continue;
    if (ref.isJSXIdentifier()) {
      // `<Tag>` where Tag is now an accessor: a tag name cannot be a call
      const element = ref.findParent((p) => p.isJSXElement());
      ctx.todo(
        element?.node ?? ref.node,
        'jsx-tag-accessor',
        `<${ref.node.name}> is a reactive value now: render it with <Dynamic component={${replacement}}>`,
      );
      continue;
    }
    if (parent.isExportSpecifier()) continue;
    if (
      options.skipCallees &&
      (parent.isCallExpression({ callee: ref.node }) || parent.isOptionalCallExpression({ callee: ref.node }))
    ) {
      continue;
    }
    if (parent.isObjectProperty({ value: ref.node }) && parent.node.shorthand) {
      ctx.overwrite(parent.node, `${(parent.node.key as t.Identifier).name}: ${replacement}`);
    } else if (parent.isJSXExpressionContainer() || parent.isJSXAttribute()) {
      ctx.overwrite(ref.node, replacement);
    } else {
      ctx.overwrite(ref.node, replacement);
    }
    count++;
  }
  return count;
}

/** Statements of a run-once body that are its direct children. */
export function bodyStatements(body: RunOnceBody): NodePath<t.Statement>[] {
  return body.body ? body.body.get('body') : [];
}

/** `useX(...)` statement or a `createEffect(...)`-style primitive call at the body level. */
export function isPrimitiveCallStatement(statement: t.Statement): boolean {
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') return false;
  const name = calleeName(statement.expression);
  return Boolean(name) && (/^use[A-Z]/.test(name) || PRIMITIVE_CALLS.has(name));
}

export const PRIMITIVE_CALLS = new Set([
  'createEffect',
  'createMeasureEffect',
  'createMutationEffect',
  'createRenderEffect',
  'createIdleEffect',
  'onMount',
  'onDestroy',
  'onCleanup',
  'watchHeavyAnimation',
  'provideHeavyAnimationScope',
]);
