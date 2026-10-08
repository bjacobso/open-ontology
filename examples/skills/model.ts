import { Ontology, defineOntology } from "../../src/index.js";
import { defineSkillModel } from "../../src/experimental/skills.js";
import { fieldService } from "../field-service/model.js";
import { Dispatch } from "./dispatch.js";

// The unchanged field-service declarations plus two fixed queries for the agent's review.
export const ontology = defineOntology({ name: "skills-field-service", version: "1" }, [
  ...fieldService.objectTypes.values(), ...fieldService.linkTypes.values(),
  ...fieldService.actionTypes.values(), ...fieldService.queryTypes.values(),
  Ontology.QueryType("unassigned-work", {
    query: {
      find: ["?workOrder", "?title"],
      where: [["?workOrder", ":work-order/title", "?title"], ["?workOrder", ":work-order/status", "open"]],
    },
  }),
  Ontology.QueryType("technicians", {
    query: { find: ["?technician", "?name"], where: [["?technician", ":technician/name", "?name"]] },
  }),
]);

export const skillModel = defineSkillModel(ontology, [Dispatch]);
