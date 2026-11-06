import { Skill } from "../../src/experimental/skills.js";

export const Dispatch = Skill.define("dispatch-work", {
  purpose: "Use when a dispatcher wants to assign an open work order to a technician.",
  inputs: ["workOrder", "technician"],
  preconditions: ["Confirm the selected work order is open and the technician is qualified; ask if uncertain."],
  steps: [
    Skill.query("unassigned-work", "Review open work and confirm the caller's workOrder id."),
    Skill.guard("technicians", "nonempty", "Check that the technician list is not empty."),
    Skill.query("technicians", "Confirm the caller's technician id appears in the returned rows."),
    Skill.action("assign-work-order", {
      workOrder: Skill.input("workOrder"), technician: Skill.input("technician"),
    }, "Assign the confirmed work order."),
    Skill.query("assigned-work", "Report the assignment to the dispatcher."),
  ],
  examples: [{
    input: { workOrder: "work-order:42", technician: "technician:ada" },
    description: "Assign work-order:42 to technician:ada after confirming both ids.",
  }],
});
