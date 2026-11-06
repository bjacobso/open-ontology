(define-skill dispatch-work
  (:purpose "Use when a dispatcher wants to assign an open work order to a technician.")
  (:inputs [workOrder technician])
  (:precondition "Confirm the selected work order is open and the technician is qualified; ask if uncertain.")
  (:query unassigned-work "Review open work and confirm the caller's workOrder id.")
  (:guard technicians nonempty "Check that the technician list is not empty.")
  (:query technicians "Confirm the caller's technician id appears in the returned rows.")
  (:action assign-work-order {:workOrder workOrder :technician technician}
    "Assign the confirmed work order.")
  (:query assigned-work "Report the assignment to the dispatcher.")
  (:example {:workOrder "work-order:42" :technician "technician:ada"}
    "Assign work-order:42 to technician:ada after confirming both ids."))
