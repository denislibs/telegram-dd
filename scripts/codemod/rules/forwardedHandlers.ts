// frameact binds an event handler prop of an element ONCE (delegated or `on:`): `<div onClick={props.onClick}>` keeps the
// function the prop had at creation. teact re-bound the handler on every render, and call sites pass handlers that change
// (`onClick={isOpen ? close : open}`, a handler that appears later). A handler forwarded from props to an intrinsic
// element therefore calls through the prop: `onClick={(e) => props.onClick?.(e)}` (porting guide §4.3). A handler whose
// type takes no arguments needs the `e` dropped by hand (tsc: "Expected 0 arguments"). Components are left alone: their
// prop getter is read by the child when it needs it.
import type { Ctx } from '../context.ts';
import type { Rule } from './index.ts';

export const forwardedHandlersRule: Rule = {
  name: 'forwardedHandlers',
  description: 'on*={props.x} on an intrinsic element → on*={(e) => props.x?.(e)} (handlers are bound once)',
  run(ctx: Ctx) {
    ctx.program.traverse({
      JSXAttribute(path) {
        const parent = path.parentPath.node;
        if (parent.type !== 'JSXOpeningElement') return;
        const tag = parent.name;
        if (tag.type !== 'JSXIdentifier' || !/^[a-z]/.test(tag.name)) return;
        const name = path.node.name;
        if (name.type !== 'JSXIdentifier' || !/^on[A-Z]/.test(name.name)) return;
        const value = path.node.value;
        if (value?.type !== 'JSXExpressionContainer') return;
        const expression = value.expression;
        if (
          expression.type !== 'MemberExpression' ||
          expression.computed ||
          expression.object.type !== 'Identifier' ||
          expression.object.name !== 'props' ||
          expression.property.type !== 'Identifier'
        ) {
          return;
        }
        ctx.overwrite(expression, `(e) => props.${expression.property.name}?.(e)`);
        ctx.hit('forwardedHandler');
      },
    });
  },
};
