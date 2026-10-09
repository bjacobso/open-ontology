import { Schema } from "effect";
import { Change, Datalog, Input, Ontology, Property, defineOntology } from "../../src/index.js";

// A small directional model inspired by supplied schema/API context, not a production import.
const Organization = Ontology.ObjectType("Organization", {
  description: "The organization boundary for accounts, users, and shared configuration. Connected organizations are outside this example.",
  properties: { name: Property.make(":organization/name", Schema.String).required() },
});

const Account = Ontology.ObjectType("Account", {
  description: "An operational context inside an organization. An account is distinct from an employer; integrations and live/test modes are omitted here.",
  properties: { organization: Property.ref(":account/organization", Organization).required() },
});

const User = Ontology.ObjectType("User", {
  description: "A dashboard user who may belong to organizations and groups, and be an employer assignee on a task.",
  properties: { email: Property.make(":user/email", Schema.String).required() },
});

const OrganizationMembership = Ontology.ObjectType("OrganizationMembership", {
  description: "Connects a user to an organization. This example records membership but grants no access.",
  properties: {
    organization: Property.ref(":organization-membership/organization", Organization).required(),
    user: Property.ref(":organization-membership/user", User).required(),
  },
});

const UserGroup = Ontology.ObjectType("UserGroup", {
  description: "An organization-scoped group with permission and access-rule configuration. Rules are opaque data; this runtime does not evaluate them.",
  properties: {
    name: Property.make(":user-group/name", Schema.String).required(),
    organization: Property.ref(":user-group/organization", Organization).required(),
    permissions: Property.make(":user-group/permissions", Schema.Unknown),
    accessRules: Property.make(":user-group/access-rules", Schema.Unknown),
  },
});

const GroupMembership = Ontology.ObjectType("GroupMembership", {
  description: "Connects a dashboard user to a user group, separately from organization membership.",
  properties: {
    user: Property.ref(":group-membership/user", User).required(),
    userGroup: Property.ref(":group-membership/user-group", UserGroup).required(),
  },
});

const CustomProperty = Ontology.ObjectType("CustomProperty", {
  description: "A named domain attribute with a path, scalar type, and permission-scope flag. The flag is modeled as data, not an enforced authorization boundary.",
  properties: {
    organization: Property.ref(":custom-property/organization", Organization),
    path: Property.make(":custom-property/path", Schema.String).required(),
    scalarType: Property.make(":custom-property/scalar-type", Schema.String).required(),
    isPermissionScope: Property.make(":custom-property/is-permission-scope", Schema.Boolean).required(),
  },
});

const Employee = Ontology.ObjectType("Employee", {
  description: "An account-scoped person with placements and tasks. Personal details are reduced to a synthetic display name in this example.",
  properties: {
    name: Property.make(":employee/name", Schema.String).required(),
    account: Property.ref(":employee/account", Account).required(),
  },
});

const Employer = Ontology.ObjectType("Employer", {
  description: "An employer record inside an account. It provides employment context and is separate from the organization that owns the account.",
  properties: {
    name: Property.make(":employer/name", Schema.String).required(),
    account: Property.ref(":employer/account", Account).required(),
  },
});

const Placement = Ontology.ObjectType("Placement", {
  description: "Employment context for an employee, optionally with an employer. Client and job-type dimensions are omitted; tasks are not modeled as children of a placement.",
  properties: {
    account: Property.ref(":placement/account", Account).required(),
    employee: Property.ref(":placement/employee", Employee).required(),
    employer: Property.ref(":placement/employer", Employer),
  },
});

const TaskLineage = Ontology.ObjectType("TaskLineage", {
  description: "A form's identity across versions. Policies refer to this lineage, while a running task refers to a concrete template.",
  properties: { name: Property.make(":task-lineage/name", Schema.String).required() },
});

const TaskVersion = Ontology.ObjectType("TaskVersion", {
  description: "A version of a form lineage, with a publication status. Publication, inheritance, and deployment behavior are not implemented here.",
  properties: {
    taskLineage: Property.ref(":task-version/task-lineage", TaskLineage).required(),
    status: Property.make(":task-version/status", Schema.String).required(),
  },
});

const TaskTemplate = Ontology.ObjectType("TaskTemplate", {
  description: "The concrete form definition for a version and lineage. A template contains page templates and is referenced by running tasks.",
  properties: {
    name: Property.make(":task-template/name", Schema.String).required(),
    taskLineage: Property.ref(":task-template/task-lineage", TaskLineage).required(),
    taskVersion: Property.ref(":task-template/task-version", TaskVersion).required(),
  },
});

const SubtaskTemplate = Ontology.ObjectType("SubtaskTemplate", {
  description: "A page of a form, with an assignee type such as employee, employer, or system. Page ordering and options are simplified away.",
  properties: {
    taskTemplate: Property.ref(":subtask-template/task-template", TaskTemplate).required(),
    assigneeType: Property.make(":subtask-template/assignee-type", Schema.String).required(),
  },
});

const FieldTemplate = Ontology.ObjectType("FieldTemplate", {
  description: "A field with a data path and an optional rule, normally on a page template. Rule evaluation, repeatable groups, and formula elaboration are outside this example.",
  properties: {
    subtaskTemplate: Property.ref(":field-template/subtask-template", SubtaskTemplate),
    path: Property.make(":field-template/path", Schema.String).required(),
    required: Property.make(":field-template/required", Schema.Boolean).required(),
    rule: Property.make(":field-template/rule", Schema.Unknown),
  },
});

const Task = Ontology.ObjectType("Task", {
  description: "A running instance of a form for an employee in an account, optionally scoped to an employer and assigned to a dashboard user. Demo actions and next-action values are illustrative.",
  properties: {
    account: Property.ref(":task/account", Account).required(),
    employee: Property.ref(":task/employee", Employee).required(),
    employer: Property.ref(":task/employer", Employer),
    template: Property.ref(":task/template", TaskTemplate).required(),
    employerAssignee: Property.ref(":task/employer-assignee", User),
    status: Property.make(":task/status", Schema.String).required(),
    nextAction: Property.make(":task/next-action", Schema.String),
    startedAt: Property.instant(":task/started-at"),
  },
});

const Policy = Ontology.ObjectType("Policy", {
  description: "Configuration describing when forms should be required. Account ownership is optional to allow shared policies; policy evaluation is not implemented.",
  properties: {
    name: Property.make(":policy/name", Schema.String).required(),
    account: Property.ref(":policy/account", Account),
    rules: Property.make(":policy/rules", Schema.Unknown),
  },
});

const PolicyForm = Ontology.ObjectType("PolicyForm", {
  description: "Connects a policy to a form lineage, optionally with a form-specific rule. This records configuration without generating suggested tasks.",
  properties: {
    policy: Property.ref(":policy-form/policy", Policy).required(),
    taskLineage: Property.ref(":policy-form/task-lineage", TaskLineage).required(),
    rule: Property.make(":policy-form/rule", Schema.Unknown),
  },
});

const Automation = Ontology.ObjectType("Automation", {
  description: "A named automation with a trigger entity and optional account scope. Trigger facts, versioned actions, and execution traces are omitted; no automation engine is implied.",
  properties: {
    name: Property.make(":automation/name", Schema.String).required(),
    account: Property.ref(":automation/account", Account),
    triggerEntity: Property.make(":automation/trigger-entity", Schema.String).required(),
  },
});

const AuthzInferenceRule = Ontology.ObjectType("AuthzInferenceRule", {
  description: "Account configuration naming the entity types involved in an authorization inference. The example stores these names without enforcing the inference.",
  properties: {
    account: Property.ref(":authz-inference-rule/account", Account).required(),
    inferredFromEntity: Property.make(":authz-inference-rule/inferred-from-entity", Schema.String).required(),
    appliedToEntity: Property.make(":authz-inference-rule/applied-to-entity", Schema.String).required(),
  },
});

const StartTask = Ontology.ActionType("start-task", {
  description: "Demo action creating an employee task against a concrete template. It does not call the supplied API or evaluate policy requirements.",
  input: Schema.Struct({ task: Schema.String, account: Schema.String, employee: Schema.String, template: Schema.String }),
  changes: [Change.create(Task, Input.value("task"), {
    ":task/account": Input.value("account"),
    ":task/employee": Input.value("employee"),
    ":task/template": Input.value("template"),
    ":task/status": "requires_action",
    ":task/next-action": "employee-input",
    ":task/started-at": Input.now,
  })],
});

const RequestReview = Ontology.ActionType("request-review", {
  description: "Demo action moving the next action to employer-review and replacing the employer assignee. It performs no permission, document, or completion checks.",
  input: Schema.Struct({ task: Schema.String, user: Schema.String }),
  changes: [
    Change.clear(Input.value("task"), Task.properties.nextAction),
    Change.set(Input.value("task"), Task.properties.nextAction, "employer-review"),
    Change.clear(Input.value("task"), Task.properties.employerAssignee),
    Change.set(Input.value("task"), Task.properties.employerAssignee, Input.value("user")),
  ],
});

const v = Datalog.variables({
  task: Task.entity, employee: Employee.entity, employeeName: Schema.String,
  template: TaskTemplate.entity, formName: Schema.String, status: Schema.String,
  nextAction: Schema.String, user: User.entity, assigneeEmail: Schema.String,
  version: TaskVersion.entity, lineage: TaskLineage.entity, lineageName: Schema.String,
});

const EmployeeTasks = Ontology.QueryType("employee-tasks", {
  description: "Joins running tasks to employees and concrete form templates. Results are not permission-filtered.",
  query: Datalog.query({
    find: [v.employeeName, v.formName, v.status, v.nextAction],
    where: [
      Datalog.match(v.task, Task.properties.employee, v.employee),
      Datalog.match(v.task, Task.properties.template, v.template),
      Datalog.match(v.task, Task.properties.status, v.status),
      Datalog.match(v.task, Task.properties.nextAction, v.nextAction),
      Datalog.match(v.employee, Employee.properties.name, v.employeeName),
      Datalog.match(v.template, TaskTemplate.properties.name, v.formName),
    ],
  }),
});

const ReviewQueue = Ontology.QueryType("review-queue", {
  description: "Demo query joining employee tasks needing employer review to their assigned dashboard users. It is not the production pending-employer-tasks API or an access rule.",
  query: Datalog.query({
    find: [v.employeeName, v.assigneeEmail],
    where: [
      Datalog.match(v.task, Task.properties.status, "requires_action"),
      Datalog.match(v.task, Task.properties.nextAction, "employer-review"),
      Datalog.match(v.task, Task.properties.employee, v.employee),
      Datalog.match(v.employee, Employee.properties.name, v.employeeName),
      Datalog.match(v.task, Task.properties.employerAssignee, v.user),
      Datalog.match(v.user, User.properties.email, v.assigneeEmail),
    ],
  }),
});

const FormVersions = Ontology.QueryType("form-versions", {
  description: "Shows concrete templates alongside the form lineage and version status. No release or deployment operation is performed.",
  query: Datalog.query({
    find: [v.lineageName, v.formName, v.status],
    where: [
      Datalog.match(v.template, TaskTemplate.properties.taskVersion, v.version),
      Datalog.match(v.version, TaskVersion.properties.taskLineage, v.lineage),
      Datalog.match(v.version, TaskVersion.properties.status, v.status),
      Datalog.match(v.lineage, TaskLineage.properties.name, v.lineageName),
      Datalog.match(v.template, TaskTemplate.properties.name, v.formName),
    ],
  }),
});

export const onboarded = defineOntology({ name: "onboarded-example", version: "2" }, [
  Organization, Account, User, OrganizationMembership, UserGroup, GroupMembership, CustomProperty,
  Employee, Employer, Placement, TaskLineage, TaskVersion, TaskTemplate, SubtaskTemplate, FieldTemplate,
  Task, Policy, PolicyForm, Automation, AuthzInferenceRule, StartTask, RequestReview, EmployeeTasks, ReviewQueue, FormVersions,
]);
