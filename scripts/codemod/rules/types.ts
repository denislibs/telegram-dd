// `memo(X)` → `X` (a component runs once), `const X: FC<P> = (…) =>` → `const X = (…: P) =>`,
// `TeactNode` → `JSX.Element`, `ElementRef<T>` in prop types → `(el: T) => void`.
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';

import type { Rule } from './index.ts';

import { findConnected } from '../analysis.ts';
import { type Ctx, isGlobalRef } from '../context.ts';

function typeParamsOf(node: t.Node): t.TSTypeParameterInstantiation | undefined {
  const any = node as {
    typeParameters?: t.TSTypeParameterInstantiation;
    typeArguments?: t.TSTypeParameterInstantiation;
  };
  return any.typeParameters ?? any.typeArguments;
}

export const typesRule: Rule = {
  name: 'types',
  description: 'memo() wrappers, FC<Props> typing, TeactNode → JSX.Element, ElementRef<T> → callback ref type',
  run(ctx: Ctx) {
    const connected = findConnected(ctx);
    const connectedApplies = new Set<t.Node>([...connected.values()].map((info) => info.apply.node));

    ctx.program.traverse({
      CallExpression(path) {
        const callee = path.get('callee');
        if (!isGlobalRef(callee, 'memo')) return;
        const arg = path.node.arguments[0];
        if (!arg) return;
        if (connectedApplies.has(arg as t.Node)) return; // the withGlobal rule rewrites the whole wrapper
        ctx.remove(path.node.start!, arg.start!);
        ctx.remove(arg.end!, path.node.end!);
        ctx.hit('memo');
      },
      VariableDeclarator(path) {
        const id = path.node.id;
        const annotation = id.type === 'Identifier' ? id.typeAnnotation : undefined;
        if (!annotation || annotation.type !== 'TSTypeAnnotation') return;
        const type = annotation.typeAnnotation;
        if (type.type !== 'TSTypeReference' || type.typeName.type !== 'Identifier' || type.typeName.name !== 'FC') {
          return;
        }
        const init = path.node.init;
        if (!init || (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression')) return;
        const propsType = typeParamsOf(type)?.params[0];
        ctx.remove(annotation.start!, annotation.end!);
        const param = init.params[0];
        if (param && propsType && !(param as t.Identifier | t.ObjectPattern).typeAnnotation) {
          ctx.insertAfter(param.end!, `: ${ctx.text(propsType)}`);
        }
        ctx.hit('fc');
      },
      TSTypeReference(path: NodePath<t.TSTypeReference>) {
        const name = path.node.typeName;
        if (name.type !== 'Identifier') return;
        if (name.name === 'TeactNode' && isGlobalRef(path.get('typeName') as NodePath, 'TeactNode')) {
          ctx.overwrite(path.node, 'JSX.Element');
          ctx.hit('teactNode');
        } else if (name.name === 'ElementRef' && isGlobalRef(path.get('typeName') as NodePath, 'ElementRef')) {
          const arg = typeParamsOf(path.node)?.params[0];
          ctx.overwrite(path.node, `(el: ${arg ? ctx.text(arg) : 'HTMLElement'}) => void`);
          ctx.hit('elementRefType');
        }
      },
    });
  },
};
