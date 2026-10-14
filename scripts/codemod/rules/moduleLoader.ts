// `*.async.tsx` wrappers: `const X = useModuleLoader(Bundles.B, 'X', noLoad)` + `return X ? <X {...props}/> : undefined`
// → a module-level `const X = lazy(() => loadBundle(Bundles.B).then((m) => ({ default: m.X })))` rendered inside
// `<Show when={!noLoad}>` (porting guide §4.2; chunking stays tt's through src/util/moduleLoader.ts).
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import { findBodies } from '../analysis.ts';
import { type Ctx, isGlobalRef } from '../context.ts';

function negate(ctx: Ctx, test: t.Expression): string {
  if (test.type === 'UnaryExpression' && test.operator === '!') return ctx.textWithParens(test.argument);
  if (test.type === 'Identifier' || test.type === 'MemberExpression' || test.type === 'CallExpression') {
    return `!${ctx.text(test)}`;
  }
  return `!(${ctx.text(test)})`;
}

export const moduleLoaderRule: Rule = {
  name: 'moduleLoader',
  description: 'useModuleLoader async wrappers → lazy() + <Show>',
  run(ctx: Ctx) {
    for (const body of findBodies(ctx)) {
      if (!body.body || body.kind !== 'component') continue;
      const statements = body.body.get('body');
      for (const statement of statements) {
        if (!statement.isVariableDeclaration() || statement.node.declarations.length !== 1) continue;
        const declarator = statement.node.declarations[0];
        const init = declarator.init;
        if (
          !init ||
          init.type !== 'CallExpression' ||
          init.callee.type !== 'Identifier' ||
          init.callee.name !== 'useModuleLoader'
        ) {
          continue;
        }
        if (!isGlobalRef(statement.get('declarations.0.init.callee') as NodePath, 'useModuleLoader')) continue;
        if (declarator.id.type !== 'Identifier') continue;
        const name = declarator.id.name;
        const [bundle, moduleName, noLoad, autoUpdate] = init.arguments as t.Expression[];
        if (!bundle || !moduleName || moduleName.type !== 'StringLiteral' || autoUpdate) {
          ctx.todo(
            statement.node,
            'module-loader',
            'useModuleLoader call shape not recognised: lazy() + <Show> by hand',
          );
          continue;
        }
        const last = statements[statements.length - 1];
        if (!last.isReturnStatement() || !last.node.argument) {
          ctx.todo(statement.node, 'module-loader', 'useModuleLoader without a final return: lazy() + <Show> by hand');
          continue;
        }
        let rendered: t.Expression | undefined;
        let fallback: t.Expression | undefined;
        const argument = last.node.argument;
        if (
          argument.type === 'ConditionalExpression' &&
          argument.test.type === 'Identifier' &&
          argument.test.name === name
        ) {
          rendered = argument.consequent;
          // `X ? <X/> : <Loading />` keeps its fallback as lazy()'s placeholder; `: undefined` has none
          const alternate = argument.alternate;
          if (alternate.type !== 'Identifier' && alternate.type !== 'NullLiteral') fallback = alternate;
        } else if (
          argument.type === 'LogicalExpression' &&
          argument.operator === '&&' &&
          argument.left.type === 'Identifier' &&
          argument.left.name === name
        ) {
          rendered = argument.right;
        } else if (argument.type === 'JSXElement') {
          rendered = argument;
        }
        if (!rendered) {
          ctx.todo(
            statement.node,
            'module-loader',
            'useModuleLoader render shape not recognised: lazy() + <Show> by hand',
          );
          continue;
        }
        const componentStatement = body.fn.getStatementParent();
        // The props type is explicit: without it `lazy` cannot infer `P` from the bundle's component type.
        const param = body.fn.node.params[0];
        const annotation =
          param && 'typeAnnotation' in param && param.typeAnnotation && param.typeAnnotation.type === 'TSTypeAnnotation'
            ? ctx.text(param.typeAnnotation.typeAnnotation)
            : 'Record<string, never>';
        const placeholder = fallback ? `, { placeholder: () => ${ctx.text(fallback)} }` : '';
        const lazyLine = `const ${name} = lazy<${annotation}>(() => loadBundle(${ctx.text(bundle)}).then((m) => ({ default: m.${moduleName.value} }))${placeholder});\n\n`;
        ctx.insertBefore(componentStatement.node.start!, lazyLine);
        ctx.removeStatement(statement.node);
        const renderedText = ctx.textWithParens(rendered);
        const indent = ctx.indentOf(last.node);
        if (noLoad && !(noLoad.type === 'BooleanLiteral' && !noLoad.value)) {
          ctx.overwrite(
            last.node,
            `return (\n${indent}  <Show when={${negate(ctx, noLoad)}}>\n${indent}    ${renderedText}\n${indent}  </Show>\n${indent});`,
          );
        } else {
          ctx.overwrite(last.node, `return ${renderedText};`);
        }
        ctx.hit('lazyModule');
      }
    }
  },
};
