// The pipeline: every rule gets a fresh parse of the current code and edits it through magic-string, so rules stay
// isolated (no shared AST mutation) and each one can be run, skipped or tested on its own.
import { type Rule, RULES } from './rules/index.ts';
import { Ctx, type FileReport, type TransformOptions } from './context.ts';

export interface TransformResult {
  code: string;
  report: FileReport;
}

export function selectRules(options: Pick<TransformOptions, 'only' | 'skip'>): Rule[] {
  let rules = RULES;
  if (options.only?.length) rules = rules.filter((rule) => options.only!.includes(rule.name));
  if (options.skip?.length) rules = rules.filter((rule) => !options.skip!.includes(rule.name));
  return rules;
}

export function transformSource(code: string, options: TransformOptions): TransformResult {
  const report: FileReport = { file: options.filePath, hits: {}, todos: [] };
  let current = code;
  for (const rule of selectRules(options)) {
    let ctx: Ctx;
    try {
      ctx = new Ctx(current, rule.name, report, options);
    } catch (error) {
      report.error = `parse error before rule "${rule.name}": ${(error as Error).message}`;
      return { code: current === code ? code : current, report };
    }
    try {
      rule.run(ctx);
      current = ctx.result();
    } catch (error) {
      report.error = `rule "${rule.name}" failed: ${(error as Error).stack ?? String(error)}`;
      return { code: current, report };
    }
  }
  // Line numbers in the report refer to the pass that produced them; recompute them against the final code
  // (identical messages are matched in order of appearance).
  const lines = current.split('\n');
  const byMessage = new Map<string, number[]>();
  lines.forEach((line, index) => {
    const match = /TODO\(codemod\): (.*?)(?: \*\/\})?$/.exec(line);
    if (!match) return;
    const list = byMessage.get(match[1]) ?? [];
    list.push(index + 1);
    byMessage.set(match[1], list);
  });
  const sorted = [...report.todos].sort((a, b) => a.line - b.line);
  for (const todo of sorted) {
    const list = byMessage.get(todo.message);
    if (list?.length) todo.line = list.shift()!;
  }
  return { code: current, report };
}
