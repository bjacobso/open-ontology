import { describe, expect, it } from "vitest";
import { checkFormaSource, checkModelFile } from "../scripts/check-model.js";

const ticket = `(define-entity Ticket
  (:field [ticket/status String {:required true}])
  (:field [ticket/note String]))
`;
const messages = (source: string) =>
  checkFormaSource(source, { name: "check" }).diagnostics.map(({ severity, message, line }) => ({ severity, message, line }));

describe("model:check", () => {
  it("accepts both field-service sources without warnings", async () => {
    for (const file of ["examples/field-service/model.lisp", "examples/field-service/model.ts"]) {
      const result = await checkModelFile(file, { name: "field-service", version: "1" });
      expect(result).toMatchObject({ ok: true, diagnostics: [] });
    }
  });

  it("locates elaboration errors", () => {
    expect(messages(`${ticket}(define-relation owned-by Ticket Person)`)).toEqual([
      { severity: "error", message: "Link owned-by has unknown endpoints Ticket -> Person", line: 4 },
    ]);
  });

  it("locates naming errors raised while materializing", () => {
    expect(messages(`${ticket}(define-action closeTicket (:input [t String {:required true}]) (:returns String) (:do (clear t :ticket/note)))`))
      .toEqual([{ severity: "error", message: "Link, action, and query names must be kebab-case; received closeTicket", line: 4 }]);
  });

  it("warns about mistakes that compile but misbehave", () => {
    const source = `${ticket}(define-action close-ticket
  (:input [ticket String {:required true}])
  (:input [note String])
  (:returns String)
  (:do (changes (set tickt :ticket/status "closed") (set ticket :ticket/note note))))
(define-datalog-query closed
  (:query {:find ["?t" "?why"] :where [["?t" ":ticket/stauts" "closed"]]}))`;
    expect(messages(source).map(({ message }) => message.split(";")[0])).toEqual([
      'Action close-ticket targets the fixed object id "tickt"',
      "Action close-ticket sets :ticket/status without clearing it first",
      "Action close-ticket uses optional input note in a change",
      "Action close-ticket sets :ticket/note without clearing it first",
      "Query closed matches :ticket/stauts, which no object or link declares",
      "Query closed finds ?why, which no :where clause binds",
    ]);
  });

  it("reports unreadable files as errors", async () => {
    const result = await checkModelFile("examples/missing/model.lisp");
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.message).toMatch(/ENOENT/);
  });
});
