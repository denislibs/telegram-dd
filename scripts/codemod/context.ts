// The per-pass editing context: one Babel AST over the current code and one MagicString of edits.
// Rules only overwrite/insert/remove source ranges, never reprint, so every untouched line stays byte-identical
// (telegram-tt is not prettier-formatted and the output must stay a readable diff against the reference).
import { parse, type ParseResult } from '@babel/parser';
import traverse, { type NodePath, type Scope } from '@babel/traverse';
import type * as t from '@babel/types';
import { MagicString } from 'magic-string';

export type TodoKind = string;

export interface Todo {
  rule: string;
  kind: TodoKind;
  message: string;
  line: number;
}

export interface FileReport {
  file: string;
  hits: Record<string, number>;
  todos: Todo[];
  /** Set when the file could not be parsed or a rule threw; the input is returned unchanged. */
  error?: string;
}

export interface TransformOptions {
  /** Path of the file relative to the repository root (`src/components/ui/Button.tsx`): used for relative imports. */
  filePath: string;
  /** Only run these rules (by name). */
  only?: string[];
  /** Skip these rules. */
  skip?: string[];
}

export const TODO_PREFIX = 'TODO(codemod)';

export function parseCode(code: string): ParseResult<t.File> {
  return parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    attachComment: true,
    errorRecovery: false,
  });
}

export class Ctx {
  readonly ast: t.File;
  readonly ms: MagicString;
  readonly program: NodePath<t.Program>;
  private todoLines = new Set<number>();

  constructor(
    readonly code: string,
    readonly rule: string,
    readonly report: FileReport,
    readonly options: TransformOptions,
  ) {
    this.ast = parseCode(code);
    this.ms = new MagicString(code);
    let program: NodePath<t.Program> | undefined;
    traverse(this.ast, {
      Program(path) {
        program = path;
        path.stop();
      },
    });
    this.program = program!;
  }

  get scope(): Scope {
    return this.program.scope;
  }

  text(node: t.Node): string {
    return this.code.slice(node.start!, node.end!);
  }

  /** Source text of an expression including its parentheses when it had them. */
  textWithParens(node: t.Node): string {
    const paren = (node.extra as { parenthesized?: boolean; parenStart?: number } | undefined) ?? {};
    if (paren.parenthesized && typeof paren.parenStart === 'number') {
      return this.code.slice(paren.parenStart, this.closingParen(node) + 1);
    }
    return this.text(node);
  }

  /** The range `[start, end)` of an expression including its parentheses when it had them. */
  rangeWithParens(node: t.Node): [number, number] {
    const paren = (node.extra as { parenthesized?: boolean; parenStart?: number } | undefined) ?? {};
    if (paren.parenthesized && typeof paren.parenStart === 'number') {
      return [paren.parenStart, this.closingParen(node) + 1];
    }
    return [node.start!, node.end!];
  }

  private closingParen(node: t.Node): number {
    let i = node.end!;
    while (i < this.code.length && this.code[i] !== ')') i++;
    return i;
  }

  overwrite(node: t.Node | [number, number], text: string): void {
    const [start, end] = Array.isArray(node) ? node : [node.start!, node.end!];
    if (start === end) {
      this.ms.appendLeft(start, text);
    } else {
      this.ms.overwrite(start, end, text);
    }
  }

  insertBefore(node: t.Node | number, text: string): void {
    this.ms.appendLeft(typeof node === 'number' ? node : node.start!, text);
  }

  insertAfter(node: t.Node | number, text: string): void {
    this.ms.prependRight(typeof node === 'number' ? node : node.end!, text);
  }

  remove(start: number, end: number): void {
    if (end > start) this.ms.remove(start, end);
  }

  /** The offset of the first character of the line containing `pos`. */
  lineStart(pos: number): number {
    const nl = this.code.lastIndexOf('\n', pos - 1);
    return nl === -1 ? 0 : nl + 1;
  }

  /** The offset just after the newline that ends the line containing `pos` (or the end of the file). */
  lineEnd(pos: number): number {
    const nl = this.code.indexOf('\n', pos);
    return nl === -1 ? this.code.length : nl + 1;
  }

  lineNumber(pos: number): number {
    let line = 1;
    for (let i = 0; i < pos && i < this.code.length; i++) if (this.code.charCodeAt(i) === 10) line++;
    return line;
  }

  indentOf(node: t.Node | number): string {
    const pos = typeof node === 'number' ? node : node.start!;
    const start = this.lineStart(pos);
    const match = /^[ \t]*/.exec(this.code.slice(start, pos));
    return match ? match[0] : '';
  }

  /**
   * Remove a statement together with its line(s) when it occupies them alone (so no blank line is left behind);
   * otherwise only the statement text.
   */
  removeStatement(node: t.Node): void {
    const start = node.start!;
    const end = node.end!;
    const ls = this.lineStart(start);
    const le = this.lineEnd(end);
    const before = this.code.slice(ls, start);
    const after = this.code.slice(end, le);
    if (/^[ \t]*$/.test(before) && /^[ \t]*;?[ \t]*(\/\/[^\n]*)?\n?$/.test(after)) {
      // Leading comments on their own lines go with the statement.
      let from = ls;
      const comments = node.leadingComments ?? [];
      for (const comment of comments) {
        const cls = this.lineStart(comment.start!);
        if (/^[ \t]*$/.test(this.code.slice(cls, comment.start)) && cls < from) from = cls;
      }
      let to = le;
      // Do not leave two blank lines behind: a blank line before and after the statement collapses to one.
      if (this.code[to] === '\n' && from >= 2 && this.code[from - 1] === '\n' && this.code[from - 2] === '\n') to++;
      this.remove(from, to);
    } else {
      this.remove(start, end);
    }
  }

  hit(key = this.rule, count = 1): void {
    this.report.hits[key] = (this.report.hits[key] ?? 0) + count;
  }

  /**
   * Insert `// TODO(codemod): …` on its own line above `node` (once per line) and record it in the report. Inside JSX
   * children the comment is `{/* … *\/}`; a TODO on an attribute moves to the line above its element.
   */
  todo(node: t.Node | number, kind: TodoKind, message: string): void {
    let pos = typeof node === 'number' ? node : node.start!;
    let context: 'js' | 'jsx' = 'js';
    if (typeof node !== 'number') {
      const placed = this.jsxContext(node);
      pos = placed.pos;
      context = placed.context;
    }
    const ls = this.lineStart(pos);
    const line = this.lineNumber(pos);
    this.report.todos.push({ rule: this.rule, kind, message, line });
    this.hit(`todo:${kind}`);
    if (this.todoLines.has(ls)) return;
    this.todoLines.add(ls);
    const text = context === 'jsx' ? `{/* ${TODO_PREFIX}: ${message} */}` : `// ${TODO_PREFIX}: ${message}`;
    this.ms.prependLeft(ls, `${this.indentOf(pos)}${text}\n`);
  }

  /** Where a comment for `node` may go: as JS above it, as a JSX comment child, or above the element of an attribute. */
  private jsxContext(node: t.Node): { pos: number; context: 'js' | 'jsx' } {
    let deepest: NodePath | undefined;
    this.program.traverse({
      enter(path) {
        if (path.node.start! > node.start! || path.node.end! < node.end!) {
          path.skip();
          return;
        }
        deepest = path;
        if (path.node === node) path.stop();
      },
    });
    let p: NodePath | null | undefined = deepest;
    const pos = node.start!;
    while (p) {
      if (p.isJSXAttribute() || p.isJSXSpreadAttribute() || p.isJSXOpeningElement()) {
        const element = p.findParent((q) => q.isJSXElement());
        if (!element) return { pos, context: 'js' };
        return this.jsxContext(element.node);
      }
      const parent: NodePath | null = p.parentPath;
      if (p.isJSXExpressionContainer()) {
        // a child `{…}`: the comment goes before it as a JSX comment; an attribute value: above the element
        if (parent?.isJSXElement() || parent?.isJSXFragment()) return { pos: p.node.start!, context: 'jsx' };
        p = parent;
        continue;
      }
      if (
        parent &&
        (parent.isJSXElement() || parent.isJSXFragment()) &&
        (p.isJSXElement() || p.isJSXFragment() || p.isJSXText() || p.isJSXExpressionContainer())
      ) {
        return { pos: p.node.start!, context: 'jsx' };
      }
      if (p.isJSXElement() && parent && !parent.isJSXElement() && !parent.isJSXFragment()) {
        // the root element of an expression: JS context above it
        return { pos: p.node.start!, context: 'js' };
      }
      p = parent;
    }
    return { pos, context: 'js' };
  }

  /** `() => expr`, with the parentheses an object literal / sequence needs; a function stays as it is. */
  thunk(node: t.Node): string {
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return this.text(node);
    const text = this.textWithParens(node);
    const paren = (node.extra as { parenthesized?: boolean } | undefined)?.parenthesized;
    if ((node.type === 'ObjectExpression' || node.type === 'SequenceExpression') && !paren) return `() => (${text})`;
    return `() => ${text}`;
  }

  /** `createMemo(() => expr)` wrapping as [prefix, suffix] around the (parenthesised) init range. */
  memoWrap(node: t.Node, generic = ''): [string, string] {
    const paren = (node.extra as { parenthesized?: boolean } | undefined)?.parenthesized;
    const needsParens = node.type === 'ObjectExpression' && !paren;
    return [`createMemo${generic}(() => ${needsParens ? '(' : ''}`, `${needsParens ? ')' : ''})`];
  }

  result(): string {
    return this.ms.toString();
  }
}

/** The local name of an import binding for `imported` from a module matching `source`, if any. */
export function importedLocal(ctx: Ctx, source: RegExp, imported: string): string | undefined {
  for (const statement of ctx.ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || !source.test(statement.source.value)) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier') {
        const name = specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
        if (name === imported) return specifier.local.name;
      } else if (specifier.type === 'ImportDefaultSpecifier' && imported === 'default') {
        return specifier.local.name;
      }
    }
  }
  return undefined;
}

/** Whether `id` (an Identifier path) is a reference to a module-level binding named `name` (not shadowed). */
export function isGlobalRef(path: NodePath, name: string): boolean {
  if (!path.isIdentifier({ name })) return false;
  const binding = path.scope.getBinding(name);
  return !binding || binding.scope.block.type === 'Program';
}

export function calleeName(call: t.CallExpression): string | undefined {
  const callee = call.callee;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return undefined;
}

/** A hook-ish call `useX(…)` (not a member call). */
export function isHookCall(node: t.Node | null | undefined): node is t.CallExpression {
  return (
    Boolean(node) &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    /^use[A-Z]/.test(node.callee.name)
  );
}

export const CAPITALIZED = /^[A-Z]/;
