import { Schema } from "effect";
import { Change, Datalog, Input, Ontology, Property, defineOntology } from "../../src/index.js";

// An illustrative onboarding domain, not an import of Onboarded's production config.
const Account = Ontology.ObjectType("Account", {
  description: "An employer account. Ownership is recorded here; authorization belongs to the host.",
  properties: { name: Property.make(":account/name", Schema.String).required() },
});

const Employee = Ontology.ObjectType("Employee", {
  description: "A person joining an employer, with an explicit reference to their account.",
  properties: {
    name: Property.make(":employee/name", Schema.String).required(),
    account: Property.ref(":employee/account", Account).required(),
  },
});

const Onboarding = Ontology.ObjectType("Onboarding", {
  description: "An onboarding case. Status is data, not an enforced state machine or an I-9 compliance decision.",
  properties: {
    employee: Property.ref(":onboarding/employee", Employee).required(),
    status: Property.make(":onboarding/status", Schema.String).required(),
    startedAt: Property.instant(":onboarding/started-at").required(),
  },
});

const Document = Ontology.ObjectType("Document", {
  description: "Document metadata associated with a case. File storage and form validation are outside this model.",
  properties: {
    onboarding: Property.ref(":document/onboarding", Onboarding).required(),
    type: Property.make(":document/type", Schema.String).required(),
  },
});

const Reviewer = Ontology.ObjectType("Reviewer", {
  description: "An employer reviewer who can be assigned to a case. The model does not grant access.",
  properties: { name: Property.make(":reviewer/name", Schema.String).required() },
});

const Membership = Ontology.ObjectType("Membership", {
  description: "An account membership with a role. A future permission scope could load these facts; v0.1 does not enforce it.",
  properties: {
    account: Property.ref(":membership/account", Account).required(),
    reviewer: Property.ref(":membership/reviewer", Reviewer).required(),
    role: Property.make(":membership/role", Schema.String).required(),
  },
});

const ReviewedBy = Ontology.LinkType("reviewed-by", {
  description: "Records a case's assigned reviewer and assignment time. Reassignment policy is a host concern.",
  from: Onboarding,
  to: Reviewer,
  properties: { assignedAt: Property.instant(":reviewed-by/assigned-at").required() },
});

const StartOnboarding = Ontology.ActionType("start-onboarding", {
  description: "Creates a case referencing an employee, with an initial status and timestamp.",
  input: Schema.Struct({ onboarding: Schema.String, employee: Schema.String }),
  changes: [
    Change.create(Onboarding, Input.value("onboarding"), {
      ":onboarding/employee": Input.value("employee"),
      ":onboarding/status": "draft",
      ":onboarding/started-at": Input.now,
    }),
  ],
});

const RequestReview = Ontology.ActionType("request-review", {
  description: "Replaces the case status with awaiting-review and records a reviewer assignment. No permission or document checks are implied.",
  input: Schema.Struct({ onboarding: Schema.String, reviewer: Schema.String }),
  changes: [
    Change.clear(Input.value("onboarding"), Onboarding.properties.status),
    Change.set(Input.value("onboarding"), Onboarding.properties.status, "awaiting-review"),
    Change.link(ReviewedBy, Input.value("onboarding"), Input.value("reviewer"), {
      ":reviewed-by/assigned-at": Input.now,
    }),
  ],
});

const v = Datalog.variables({
  onboarding: Onboarding.entity,
  employee: Employee.entity,
  account: Account.entity,
  employeeName: Schema.String,
  accountName: Schema.String,
  status: Schema.String,
  assignment: ReviewedBy.entity,
  reviewer: Reviewer.entity,
  reviewerName: Schema.String,
});

const OnboardingCases = Ontology.QueryType("onboarding-cases", {
  description: "Joins cases to employees and employer accounts. Results are not permission-filtered.",
  query: Datalog.query({
    find: [v.employeeName, v.accountName, v.status],
    where: [
      Datalog.match(v.onboarding, Onboarding.properties.employee, v.employee),
      Datalog.match(v.onboarding, Onboarding.properties.status, v.status),
      Datalog.match(v.employee, Employee.properties.name, v.employeeName),
      Datalog.match(v.employee, Employee.properties.account, v.account),
      Datalog.match(v.account, Account.properties.name, v.accountName),
    ],
  }),
});

const ReviewQueue = Ontology.QueryType("review-queue", {
  description: "Finds cases awaiting review and their assigned reviewers. This is a data query, not an access rule.",
  query: Datalog.query({
    find: [v.employeeName, v.reviewerName],
    where: [
      Datalog.match(v.onboarding, Onboarding.properties.status, "awaiting-review"),
      Datalog.match(v.onboarding, Onboarding.properties.employee, v.employee),
      Datalog.match(v.employee, Employee.properties.name, v.employeeName),
      Datalog.match(v.assignment, ReviewedBy.endpoints.from, v.onboarding),
      Datalog.match(v.assignment, ReviewedBy.endpoints.to, v.reviewer),
      Datalog.match(v.reviewer, Reviewer.properties.name, v.reviewerName),
    ],
  }),
});

export const onboarded = defineOntology({ name: "onboarded-example", version: "1" }, [
  Account, Employee, Onboarding, Document, Reviewer, Membership,
  ReviewedBy, StartOnboarding, RequestReview, OnboardingCases, ReviewQueue,
]);
