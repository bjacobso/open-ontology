import { Schema } from "effect";
import { Change, Datalog, Input, Ontology, Property, defineOntology } from "../../src/index.js";

const Technician = Ontology.ObjectType("Technician", {
  properties: { name: Property.make(":technician/name", Schema.String).required() },
});

const WorkOrder = Ontology.ObjectType("WorkOrder", {
  properties: {
    title: Property.make(":work-order/title", Schema.String).required(),
    status: Property.make(":work-order/status", Schema.String).required(),
  },
});

const AssignedTo = Ontology.LinkType("assigned-to", {
  from: WorkOrder,
  to: Technician,
  properties: { assignedAt: Property.instant(":assigned-to/assigned-at").required() },
});

const AssignWorkOrder = Ontology.ActionType("assign-work-order", {
  input: Schema.Struct({ workOrder: Schema.String, technician: Schema.String }),
  changes: [
    Change.set(Input.value("workOrder"), WorkOrder.properties.status, "assigned"),
    Change.link(AssignedTo, Input.value("workOrder"), Input.value("technician"), {
      ":assigned-to/assigned-at": Input.now,
    }),
  ],
});

const v = Datalog.variables({
  work: WorkOrder.entity,
  title: Schema.String,
  status: Schema.String,
  assignment: AssignedTo.entity,
  person: Technician.entity,
  technician: Schema.String,
  assignedAt: Schema.Date,
});

const AssignedWork = Ontology.QueryType("assigned-work", {
  query: Datalog.query({
    find: [v.title, v.technician],
    where: [
      Datalog.match(v.work, WorkOrder.properties.title, v.title),
      Datalog.match(v.work, WorkOrder.properties.status, v.status),
      Datalog.predicate("!=", v.status, "cancelled"),
      Datalog.not(Datalog.match(v.work, WorkOrder.properties.status, "archived")),
      Datalog.match(v.assignment, AssignedTo.endpoints.from, v.work),
      Datalog.match(v.assignment, AssignedTo.endpoints.to, v.person),
      Datalog.match(v.assignment, AssignedTo.properties.assignedAt, v.assignedAt),
      Datalog.match(v.person, Technician.properties.name, v.technician),
    ],
  }),
});

export const fieldService = defineOntology({ name: "field-service", version: "1" }, [
  Technician, WorkOrder, AssignedTo, AssignWorkOrder, AssignedWork,
]);
