// JSX: `className` → `class` on elements (a DEV error in frameact), reactive `.map()` children → `<For>` (keyed when the
// row had `key=`), `teactFastList` + `teactOrderKey` → `<ManualFor orderKey>`, `teactExperimentControlled` →
// `use:value` / `use:checked`, a reactive `key=` on a single element and non-function `<Transition>` children → TODO.
// `{cond && <X/>}` and ternaries are left alone: the compiler evaluates JSX expressions reactively.
import type { Binding, NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

import {
  classifyBindings,
  collectPropKinds,
  findBodies,
  findPath,
  isReactiveExpr,
  type Kinds,
  referencesOf,
} from '../analysis.ts';

function attrName(attr: t.JSXAttribute | t.JSXSpreadAttribute): string | undefined {
  return attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' ? attr.name.name : undefined;
}

function findAttr(element: t.JSXElement, name: string): t.JSXAttribute | undefined {
  return element.openingElement.attributes.find((a) => attrName(a) === name) as t.JSXAttribute | undefined;
}

function isIntrinsic(element: t.JSXElement): boolean {
  const name = element.openingElement.name;
  return name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name);
}

function tagName(element: t.JSXElement): string {
  const name = element.openingElement.name;
  return name.type === 'JSXIdentifier'
    ? name.name
    : name.type === 'JSXMemberExpression'
      ? `${(name.object as t.JSXIdentifier).name}.${name.property.name}`
      : '';
}

/** Remove a JSX attribute with the whitespace before it. */
function removeAttr(ctx: Ctx, attr: t.JSXAttribute): void {
  let start = attr.start!;
  while (start > 0 && /\s/.test(ctx.code[start - 1])) start--;
  ctx.remove(start, attr.end!);
}

function attrValueExpr(attr: t.JSXAttribute): t.Expression | undefined {
  const value = attr.value;
  if (!value) return undefined;
  if (value.type === 'JSXExpressionContainer' && value.expression.type !== 'JSXEmptyExpression') {
    return value.expression;
  }
  if (value.type === 'StringLiteral') return value;
  return undefined;
}

/** The JSX element a map callback returns (expression body, or the last `return` of a block body). */
function returnedElement(fn: t.ArrowFunctionExpression | t.FunctionExpression): t.JSXElement | undefined {
  const unwrap = (node: t.Node | null | undefined): t.JSXElement | undefined => {
    if (!node) return undefined;
    if (node.type === 'JSXElement') return node;
    if (node.type === 'ParenthesizedExpression') return unwrap(node.expression);
    return undefined;
  };
  if (fn.body.type !== 'BlockStatement') return unwrap(fn.body);
  const last = fn.body.body[fn.body.body.length - 1];
  return last?.type === 'ReturnStatement' ? unwrap(last.argument) : undefined;
}

interface MapCall {
  container: t.JSXExpressionContainer;
  call: t.CallExpression;
  each: t.Expression;
  callback: t.ArrowFunctionExpression | t.FunctionExpression;
}

function asMapCall(child: t.JSXElement['children'][number]): MapCall | undefined {
  if (child.type !== 'JSXExpressionContainer') return undefined;
  let expr = child.expression;
  while (expr.type === 'ParenthesizedExpression') expr = expr.expression;
  if (expr.type !== 'CallExpression' && expr.type !== 'OptionalCallExpression') return undefined;
  const callee = expr.callee;
  if ((callee.type !== 'MemberExpression' && callee.type !== 'OptionalMemberExpression') || callee.computed) {
    return undefined;
  }
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'map') return undefined;
  const callback = expr.arguments[0];
  if (!callback || (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression')) {
    return undefined;
  }
  if (expr.arguments.length > 1) return undefined;
  return { container: child, call: expr as t.CallExpression, each: callee.object as t.Expression, callback };
}

function renameParam(ctx: Ctx, callbackPath: NodePath, param: t.Node | undefined, exclude: [number, number][]): void {
  if (!param || param.type !== 'Identifier') return;
  const binding: Binding | undefined = callbackPath.scope.getBinding(param.name);
  if (!binding) return;
  for (const ref of referencesOf(binding)) {
    const pos = ref.node.start!;
    if (exclude.some(([s, e]) => pos >= s && pos < e)) continue;
    const parent = ref.parentPath;
    if (parent.isCallExpression({ callee: ref.node })) continue;
    if (parent.isObjectProperty({ value: ref.node }) && parent.node.shorthand) {
      ctx.overwrite(parent.node, `${param.name}: ${param.name}()`);
    } else {
      ctx.overwrite(ref.node, `${param.name}()`);
    }
  }
}

function rewriteList(ctx: Ctx, map: MapCall, parent: t.JSXElement | undefined, kinds: Kinds, manual: boolean): void {
  const { container, call, each, callback } = map;
  const callbackPath = findPath(ctx, callback);
  if (!callbackPath) return;
  const row = returnedElement(callback);
  const keyAttr = row ? findAttr(row, 'key') : undefined;
  const orderAttr = row ? findAttr(row, 'teactOrderKey') : undefined;
  const [itemParam, indexParam] = callback.params;
  const itemName = itemParam?.type === 'Identifier' ? itemParam.name : undefined;
  const exclude: [number, number][] = [];
  const attrs: string[] = [`each={${ctx.text(each)}}`];
  let keyed = false;
  if (keyAttr) {
    const keyExpr = attrValueExpr(keyAttr);
    if (keyExpr && itemName) {
      attrs.push(`keyed={(${itemName}) => ${ctx.text(keyExpr)}}`);
      keyed = true;
    } else {
      ctx.hit('forKeyDroppedForPattern');
    }
    exclude.push([keyAttr.start!, keyAttr.end!]);
    removeAttr(ctx, keyAttr);
  }
  if (manual && orderAttr) {
    const orderExpr = attrValueExpr(orderAttr);
    if (orderExpr) attrs.push(`orderKey={(${itemName ?? 'item'}) => ${ctx.text(orderExpr)}}`);
    exclude.push([orderAttr.start!, orderAttr.end!]);
    removeAttr(ctx, orderAttr);
  }
  const tag = manual ? 'ManualFor' : 'For';
  ctx.overwrite([container.start!, callback.start!], `<${tag} ${attrs.join(' ')}>{`);
  ctx.overwrite([callback.end!, container.end!], `}</${tag}>`);
  if (keyed) renameParam(ctx, callbackPath, itemParam, exclude);
  renameParam(ctx, callbackPath, indexParam, exclude);
  ctx.hit(manual ? 'manualFor' : keyed ? 'forKeyed' : 'for');
  void call;
  void parent;
  void kinds;
}

export const jsxRule: Rule = {
  name: 'jsx',
  description:
    'className → class, .map → <For>, teactFastList → <For>/<ManualFor>, teactExperimentControlled → use:value, key= / <Transition> TODOs',
  run(ctx: Ctx) {
    const propKinds = collectPropKinds(ctx);
    const bodies = findBodies(ctx);
    const kindsByFn = new Map<t.Node, Kinds>(
      bodies.map((body) => [body.fn.node, classifyBindings(ctx, body, propKinds)]),
    );
    const emptyKinds: Kinds = { byName: new Map(), bindings: new Map() };
    const kindsFor = (path: NodePath): Kinds => {
      const fn = path.findParent((p) => kindsByFn.has(p.node));
      return fn ? kindsByFn.get(fn.node)! : emptyKinds;
    };
    const mapRows = new Set<t.JSXElement>();

    ctx.program.traverse({
      JSXElement(path: NodePath<t.JSXElement>) {
        const element = path.node;
        const kinds = kindsFor(path);
        const intrinsic = isIntrinsic(element);
        const fastList = findAttr(element, 'teactFastList');
        const controlled = findAttr(element, 'teactExperimentControlled');

        for (const attr of element.openingElement.attributes) {
          const name = attrName(attr);
          if (!name) continue;
          if (name === 'className' && intrinsic) {
            ctx.overwrite([attr.start!, attr.start! + 'className'.length], 'class');
            ctx.hit('class');
          } else if ((name === 'value' || name === 'checked') && controlled) {
            const expr = attrValueExpr(attr as t.JSXAttribute);
            if (expr) {
              ctx.overwrite((attr as t.JSXAttribute).name, `use:${name}`);
              ctx.overwrite(expr, `() => ${ctx.textWithParens(expr)}`);
              ctx.hit('controlled');
            }
          }
        }
        if (controlled) removeAttr(ctx, controlled);

        // Lists
        const children = element.children.filter((c) => !(c.type === 'JSXText' && !c.value.trim()));
        const maps = children.map(asMapCall);
        if (fastList) {
          removeAttr(ctx, fastList);
          const only = children.length === 1 ? maps[0] : undefined;
          if (!only) {
            ctx.todo(
              element,
              'fast-list',
              'teactFastList without a single .map() child: use <For> / <ManualFor> for the rows',
            );
          } else {
            const row = returnedElement(only.callback);
            const manual = Boolean(row && findAttr(row, 'teactOrderKey'));
            if (row) mapRows.add(row);
            rewriteList(ctx, only, element, kinds, manual);
          }
        } else {
          for (const map of maps) {
            if (!map) continue;
            if (!isReactiveExpr(ctx, map.each, kinds)) continue;
            const row = returnedElement(map.callback);
            if (row) mapRows.add(row);
            rewriteList(ctx, map, element, kinds, false);
          }
        }

        if (tagName(element) === 'Transition') {
          const fnChild =
            children.length === 1 &&
            children[0].type === 'JSXExpressionContainer' &&
            (children[0].expression.type === 'ArrowFunctionExpression' ||
              children[0].expression.type === 'FunctionExpression');
          if (children.length && !fnChild) {
            ctx.todo(
              element,
              'transition-children',
              '<Transition> children: use the render function and render by slide.key (framework guide §6)',
            );
          }
        }
      },
      exit(path) {
        if (!path.isJSXElement()) return;
        const element = path.node;
        if (mapRows.has(element)) return;
        const key = findAttr(element, 'key');
        if (!key) return;
        const expr = attrValueExpr(key);
        const kinds = kindsFor(path);
        if (expr && isReactiveExpr(ctx, expr, kinds)) {
          ctx.todo(
            element,
            'key-remount',
            'key= on a single element remounted it: wrap in <Show when={key} keyed>{() => …}</Show>',
          );
        } else {
          removeAttr(ctx, key);
          ctx.hit('keyRemoved');
        }
      },
    });
  },
};
