// `useRef` → a `let` variable. Element refs (`ref={x}` or an Element type) become `let x!: T` and keep `ref={x}`;
// value refs (timers, flags, previous values) become plain `let` variables. `x.current` reads and writes become `x`.
// A ref handed to a hook becomes an accessor `() => x`; a ref passed as a non-`ref` JSX prop becomes a callback ref.
import type { Binding, NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import { findBodies } from '../analysis.ts';
import { type Ctx, isGlobalRef } from '../context.ts';

const ELEMENT_TYPE = /\b(HTML\w*Element|SVG\w*Element|Element|HTMLElement|Node)\b/;

function typeArgText(ctx: Ctx, call: t.CallExpression): string | undefined {
  const any = call as t.CallExpression & {
    typeParameters?: t.TSTypeParameterInstantiation;
    typeArguments?: t.TSTypeParameterInstantiation;
  };
  const param = (any.typeParameters ?? any.typeArguments)?.params[0];
  return param ? ctx.text(param) : undefined;
}

function isRefAttr(path: NodePath): path is NodePath<t.JSXAttribute> {
  return path.isJSXAttribute() && path.node.name.type === 'JSXIdentifier' && path.node.name.name === 'ref';
}

function rewriteRef(ctx: Ctx, binding: Binding, declarator: NodePath<t.VariableDeclarator>): void {
  const name = (declarator.node.id as t.Identifier).name;
  const call = declarator.node.init as t.CallExpression;
  const statement = declarator.parentPath;
  if (statement.node.declarations.length !== 1) {
    ctx.todo(statement.node, 'ref-shape', 'useRef in a multi-declarator statement');
    return;
  }
  const typeText = typeArgText(ctx, call);
  const init = call.arguments[0];
  let usedAsElementRef = false;
  let keepTodo = false;
  const refs = binding.referencePaths;

  for (const ref of refs) {
    const parent = ref.parentPath;
    const attr = parent.isJSXExpressionContainer() ? parent.parentPath : undefined;
    if (attr && isRefAttr(attr)) usedAsElementRef = true;
    if (parent.isTSAsExpression() && parent.parentPath?.isJSXExpressionContainer()) {
      const grand = parent.parentPath.parentPath;
      if (grand && isRefAttr(grand)) usedAsElementRef = true;
    }
  }
  const isElement =
    usedAsElementRef ||
    (typeText ? ELEMENT_TYPE.test(typeText) && !/\b(number|string|boolean)\b/.test(typeText) : false);

  // 1. The declaration.
  let decl: string;
  if (isElement) {
    decl = `let ${name}!: ${typeText ?? 'HTMLElement'};`;
    ctx.hit('elementRef');
  } else {
    const hasInit = Boolean(init) && !(init.type === 'Identifier' && init.name === 'undefined');
    let type = typeText;
    if (type && !hasInit && !/\bundefined\b/.test(type)) type = `${type} | undefined`;
    // `let x: boolean = false` trips no-inferrable-types
    if (type && hasInit && /^(boolean|number|string)$/.test(type) && /Literal$/.test(init.type)) type = undefined;
    decl = `let ${name}${type ? `: ${type}` : ''}${hasInit ? ` = ${ctx.text(init)}` : ''};`;
    ctx.hit('valueRef');
  }
  ctx.overwrite(statement.node, decl);

  // 2. The uses.
  for (const ref of refs) {
    const parent = ref.parentPath;
    if (parent.isMemberExpression({ object: ref.node }) || parent.isOptionalMemberExpression({ object: ref.node })) {
      const property = parent.node.property;
      if (!parent.node.computed && property.type === 'Identifier' && property.name === 'current') {
        ctx.overwrite(parent.node, name);
        continue;
      }
      ctx.todo(parent.node, 'ref-member', `"${name}" was a ref object: only .current has a mapping`);
      keepTodo = true;
      continue;
    }
    if (parent.isTSAsExpression({ expression: ref.node })) {
      // `x as ElementRef<T>` (already `x as (el: T) => void` after the types rule) → `x as T`
      const type = parent.node.typeAnnotation;
      const param = type.type === 'TSFunctionType' ? type.params[0] : undefined;
      const annotation = param && 'typeAnnotation' in param ? param.typeAnnotation : undefined;
      const elementType = annotation?.type === 'TSTypeAnnotation' ? ctx.text(annotation.typeAnnotation) : undefined;
      ctx.overwrite(parent.node, elementType ? `${name} as ${elementType}` : name);
      continue;
    }
    if (parent.isJSXExpressionContainer()) {
      const attr = parent.parentPath;
      if (attr && isRefAttr(attr)) continue; // ref={x}: compiler-assigned (intrinsic) or a callback for components
      if (attr?.isJSXAttribute()) {
        ctx.overwrite(ref.node, `(el) => { ${name} = el; }`);
        ctx.hit('refCallbackProp');
        continue;
      }
    }
    if (parent.isCallExpression() && parent.node.callee !== ref.node) {
      const callee = parent.node.callee;
      if (callee.type === 'Identifier' && /^use[A-Z]/.test(callee.name)) {
        ctx.overwrite(ref.node, `() => ${name}`);
        ctx.hit('refToHookAccessor');
        continue;
      }
    }
    if (parent.isObjectProperty({ value: ref.node }) && parent.node.shorthand) {
      // `{ rootRef: x }` / `{ x }` into a hook options object: accessor
      const grand = parent.parentPath.parentPath;
      if (
        grand?.isCallExpression() &&
        grand.node.callee.type === 'Identifier' &&
        /^use[A-Z]/.test(grand.node.callee.name)
      ) {
        ctx.overwrite(parent.node, `${(parent.node.key as t.Identifier).name}: () => ${name}`);
        ctx.hit('refToHookAccessor');
        continue;
      }
    }
    if (parent.isObjectProperty({ value: ref.node })) {
      const grand = parent.parentPath.parentPath;
      if (
        grand?.isCallExpression() &&
        grand.node.callee.type === 'Identifier' &&
        /^use[A-Z]/.test(grand.node.callee.name)
      ) {
        ctx.overwrite(ref.node, `() => ${name}`);
        ctx.hit('refToHookAccessor');
        continue;
      }
    }
    ctx.todo(
      ref.node,
      'ref-value',
      `"${name}" was a ref object passed as a value: pass an accessor (() => ${name}) or a callback ref`,
    );
    keepTodo = true;
  }
  for (const violation of binding.constantViolations) {
    ctx.todo(
      violation.node,
      'ref-reassign',
      `"${name}" was a ref object and is reassigned here (a forwarded ref?): use a callback ref`,
    );
    keepTodo = true;
  }
  void keepTodo;
}

export const refsRule: Rule = {
  name: 'refs',
  description: 'useRef → let (element refs keep ref={x}; value refs are plain variables; .current dropped)',
  run(ctx: Ctx) {
    for (const body of findBodies(ctx)) {
      if (!body.body) continue;
      body.body.traverse({
        VariableDeclarator(path) {
          if (path.getFunctionParent() !== body.fn) return;
          const init = path.node.init;
          if (!init || init.type !== 'CallExpression' || init.callee.type !== 'Identifier') return;
          if (init.callee.name !== 'useRef' || !isGlobalRef(path.get('init.callee') as NodePath, 'useRef')) return;
          if (path.node.id.type !== 'Identifier') {
            ctx.todo(path.node, 'ref-shape', 'useRef result destructured');
            return;
          }
          if (path.getFunctionParent() !== body.fn) {
            ctx.todo(path.node, 'ref-nested', 'useRef inside a nested function');
            return;
          }
          const binding = path.scope.getBinding(path.node.id.name);
          if (!binding) return;
          rewriteRef(ctx, binding, path);
        },
      });
    }
  },
};
