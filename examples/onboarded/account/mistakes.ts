/** Plausible edits to the Northwind account, each caught by the checker. Tests and the site run every one. */
export interface Mistake {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly find: string;
  readonly replace: string;
  /** A fragment of the one error the edit must produce. */
  readonly error: string;
}

export const mistakes: readonly Mistake[] = [
  {
    id: "choice-typo",
    title: "A typo in a choice",
    why: "Choices are closed vocabularies, so a misspelled option is an error where it is written.",
    find: "(rule at-warehouse (= job.site-type :warehouse))",
    replace: "(rule at-warehouse (= job.site-type :warehous))",
    error: ":warehous is not an option of job.site-type. Did you mean :warehouse?",
  },
  {
    id: "access-scope",
    title: "Access that reads an unscoped attribute",
    why: "Group access may read only attributes declared with :scope. Site type is searchable, not a permission scope.",
    find: ":sees (= client.region :west)",
    replace: ":sees (= job.site-type :warehouse)",
    error: "Access rules may read only :scope attributes; job.site-type is not marked :scope",
  },
  {
    id: "trigger-scope",
    title: "A task trigger that reads placement facts",
    why: "A task trigger loads task and employee facts. Reusing a placement rule is caught through the rule's name.",
    find: "(when (not= task.status :completed)",
    replace: "(when (and (not= task.status :completed) union-covered)",
    error: "placement.union-local is not available (through rule union-covered)",
  },
  {
    id: "field-type",
    title: "A field that writes the wrong type",
    why: "A field's kind must suit the attribute it writes: a checkbox cannot store a certification date.",
    find: "(date employee.forklift-certified-on \"Certification date\" :required)",
    replace: "(checkbox employee.forklift-certified-on \"Certification date\" :required)",
    error: "A checkbox field writes boolean values; employee.forklift-certified-on is a date",
  },
  {
    id: "due-in",
    title: "Waiting after a due date that never exists",
    why: "The reminder waits two days after task.due-at, so the union card must set a due date.",
    find: "  :due-in 30\n",
    replace: "",
    error: "union-card-reminder waits after task.due-at, but union-card sets no :due-in",
  },
  {
    id: "deprecated",
    title: "Writing a deprecated attribute",
    why: "Deprecated attributes stay readable for history, but no form may write them.",
    find: "    (checkbox acknowledged",
    replace: "    (text employee.legacy-hris-id \"Legacy HRIS ID\")\n    (checkbox acknowledged",
    error: "employee.legacy-hris-id is deprecated (Replaced by badge-number); forms cannot write it",
  },
  {
    id: "unknown-form",
    title: "A misspelled form name",
    why: "Every reference resolves to a declaration in the file, with a suggestion when one is close.",
    find: "(assign forklift-certification)",
    replace: "(assign forklift-certifcation)",
    error: "Unknown form forklift-certifcation. Did you mean forklift-certification?",
  },
  {
    id: "missing-is-unknown",
    title: "Treating a missing fact as false",
    why: "An unrecorded union local leaves the union policy unknown. The scenario must say what it is waiting for.",
    find: "(expect :forms [] :unknown {union-card-obligation [placement.union-local]})",
    replace: "(expect :forms [])",
    error: "unknown: expected {}, got {union-card-obligation [placement.union-local]}",
  },
  {
    id: "wrong-expectation",
    title: "A scenario that expects the wrong forms",
    why: "Scenarios run on every check. A policy change that alters what a placement needs fails here first.",
    find: ":forms [w4 site-safety union-card]",
    replace: ":forms [w4 site-safety]",
    error: "forms: expected [w4 site-safety], got [w4 site-safety union-card]",
  },
  {
    id: "coverage",
    title: "A branch no scenario exercises",
    why: "Every policy and automation decision must be seen both true and false. Without Ada's story, no reminder is ever skipped.",
    find: `(scenario "Ada returns her union card on day ten"
  {employee.first-name "Ada" job.site-type :office
   placement.union-local :local-42 placement.weekly-hours 32}
  (day 10 (complete union-card))
  (day 40 (expect :open [] :emails [])))

`,
    replace: "",
    error: "union-card-reminder › when is never false in any scenario",
  },
];

export const applyMistake = (source: string, mistake: Mistake): string => {
  const at = source.indexOf(mistake.find);
  if (at < 0 || source.indexOf(mistake.find, at + 1) >= 0) throw new Error(`Mistake ${mistake.id} must match the source exactly once`);
  return source.slice(0, at) + mistake.replace + source.slice(at + mistake.find.length);
};
