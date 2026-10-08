import { readFileSync } from "node:fs";
import { parse, toSExprMany, type SExpr } from "@formalang/ts/reader";

/** Bundled domain sources; library paths are identifiers, not filesystem or network paths. */
export const formaLibrarySources: Readonly<Record<string, string>> = Object.freeze({
  "/std/git": readFileSync(new URL("../libraries/std/git.lisp", import.meta.url), "utf8"),
  "/github": readFileSync(new URL("../libraries/github.lisp", import.meta.url), "utf8"),
});

export interface FormaSourceExpression {
  readonly expression: SExpr;
  readonly library?: string;
}

/** Expand each bundled import once per model, retaining the original source locations. */
export const expandFormaImports = (source: string): readonly FormaSourceExpression[] => {
  const loaded = new Set<string>();
  const loading = new Set<string>();
  const expand = (text: string, library?: string): FormaSourceExpression[] => {
    const parsed = parse(text);
    if (parsed.errors.length > 0) {
      const error = parsed.errors[0]!;
      throw Object.assign(error, library === undefined ? {} : { source: library });
    }
    return toSExprMany(parsed.redTree).flatMap((expression): FormaSourceExpression[] => {
      if (expression._tag !== "List" || expression.items[0]?._tag !== "Sym" ||
        expression.items[0].name !== "import") {
        return [{ expression, ...(library === undefined ? {} : { library }) }];
      }
      const fail = (message: string): never => {
        throw Object.assign(new TypeError(message), {
          loc: expression.loc,
          ...(library === undefined ? {} : { source: library }),
        });
      };
      const path = expression.items[1];
      if (expression.items.length !== 2 || path?._tag !== "Str") {
        return fail('An ontology import must be (import "/library-path")');
      }
      const name = path.value;
      const imported = Object.hasOwn(formaLibrarySources, name) ? formaLibrarySources[name] : undefined;
      if (imported === undefined) return fail(`Unknown ontology library ${name}`);
      if (loading.has(name)) return fail(`Cyclic ontology library import ${name}`);
      if (loaded.has(name)) return [];
      loading.add(name);
      const expressions = expand(imported, name);
      loading.delete(name);
      loaded.add(name);
      return expressions;
    });
  };
  return expand(source);
};
