import { Effect } from "effect";
import { EntityId, KvTriples, Triples, boolean, ref, string } from "@triplex-build/triplex";
import { makeOntologyRuntime, ontologyToIR } from "../../src/index.js";
import { onboarded } from "./model.js";

/** Synthetic custom-property definitions for the proposed permission-scope study. */
export const permissionProperties = [
  { path: "employee.department", scalarType: "string", isPermissionScope: true },
  { path: "employee.work_location", scalarType: "string", isPermissionScope: true },
  { path: "employee.start_date", scalarType: "date", isPermissionScope: false },
] as const;

type SeedValue = ReturnType<typeof string> | ReturnType<typeof ref> | ReturnType<typeof boolean>;
const reference = (id: string) => ref(EntityId.make(id));
const record = (entityType: string, id: string, properties: Readonly<Record<string, SeedValue>>) =>
  Object.entries(properties).map(([attribute, value]) => ({
    op: "assert" as const, entityId: EntityId.make(id), entityType, attribute, value,
  }));

/** Synthetic data only: no API calls, production config, personal documents, or persistence. */
export const runOnboardedScenario = () => {
  const runtime = makeOntologyRuntime(ontologyToIR(onboarded));
  return Effect.runPromise(Effect.gen(function* () {
    const triples = yield* Triples;
    yield* triples.transact([
      ...record("Organization", "organization:demo", { ":organization/name": string("Example Organization") }),
      ...record("Account", "account:demo", { ":account/organization": reference("organization:demo") }),
      ...record("Employee", "employee:ada", { ":employee/name": string("Ada Example"), ":employee/account": reference("account:demo") }),
      ...record("Employer", "employer:demo", { ":employer/name": string("Example Employer"), ":employer/account": reference("account:demo") }),
      ...record("Placement", "placement:ada", {
        ":placement/account": reference("account:demo"), ":placement/employee": reference("employee:ada"), ":placement/employer": reference("employer:demo"),
      }),
      ...record("User", "user:grace", { ":user/email": string("grace@example.invalid") }),
      ...record("User", "user:lee", { ":user/email": string("lee@example.invalid") }),
      ...record("OrganizationMembership", "org-membership:grace", {
        ":organization-membership/organization": reference("organization:demo"), ":organization-membership/user": reference("user:grace"),
      }),
      ...record("UserGroup", "user-group:review", {
        ":user-group/name": string("Employer review"), ":user-group/organization": reference("organization:demo"),
      }),
      ...record("GroupMembership", "group-membership:grace", {
        ":group-membership/user": reference("user:grace"), ":group-membership/user-group": reference("user-group:review"),
      }),
      ...record("TaskLineage", "lineage:demo", { ":task-lineage/name": string("Example onboarding form") }),
      ...record("TaskVersion", "version:demo", {
        ":task-version/task-lineage": reference("lineage:demo"), ":task-version/status": string("published"),
      }),
      ...record("TaskTemplate", "template:demo", {
        ":task-template/name": string("Example form v1"), ":task-template/task-lineage": reference("lineage:demo"), ":task-template/task-version": reference("version:demo"),
      }),
      ...record("SubtaskTemplate", "page:demo", {
        ":subtask-template/task-template": reference("template:demo"), ":subtask-template/assignee-type": string("employee"),
      }),
      ...record("FieldTemplate", "field:demo", {
        ":field-template/subtask-template": reference("page:demo"), ":field-template/path": string("employee.department"), ":field-template/required": boolean(true),
      }),
      ...record("Policy", "policy:demo", { ":policy/name": string("Example onboarding policy"), ":policy/account": reference("account:demo") }),
      ...record("PolicyForm", "policy-form:demo", { ":policy-form/policy": reference("policy:demo"), ":policy-form/task-lineage": reference("lineage:demo") }),
      ...record("Automation", "automation:demo", {
        ":automation/name": string("Example placement trigger"), ":automation/account": reference("account:demo"), ":automation/trigger-entity": string("placement"),
      }),
      ...record("AuthzInferenceRule", "inference:demo", {
        ":authz-inference-rule/account": reference("account:demo"), ":authz-inference-rule/inferred-from-entity": string("employee"), ":authz-inference-rule/applied-to-entity": string("task"),
      }),
      ...permissionProperties.flatMap((property) => record("CustomProperty", `property:${property.path}`, {
        ":custom-property/organization": reference("organization:demo"), ":custom-property/path": string(property.path),
        ":custom-property/scalar-type": string(property.scalarType), ":custom-property/is-permission-scope": boolean(property.isPermissionScope),
      })),
    ]);
    const context = { actor: "agent:demo", now: 1_800_000_000_000 };
    yield* runtime.invoke("start-task", { task: "task:ada", account: "account:demo", employee: "employee:ada", template: "template:demo" }, context);
    const before = {
      tasks: (yield* runtime.query("employee-tasks")).results,
      queue: (yield* runtime.query("review-queue")).results,
    };
    yield* runtime.invoke("request-review", { task: "task:ada", user: "user:grace" }, context);
    const after = {
      tasks: (yield* runtime.query("employee-tasks")).results,
      queue: (yield* runtime.query("review-queue")).results,
    };
    yield* runtime.invoke("request-review", { task: "task:ada", user: "user:lee" }, context);
    const reassigned = { queue: (yield* runtime.query("review-queue")).results };
    return { forms: (yield* runtime.query("form-versions")).results, before, after, reassigned };
  }).pipe(Effect.provide(KvTriples.layer)));
};
