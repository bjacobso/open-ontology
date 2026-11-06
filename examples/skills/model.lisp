(define-entity Technician
  (:field [technician/name String {:required true}]))

(define-entity WorkOrder
  (:field [work-order/title String {:required true}])
  (:field [work-order/status String {:required true}]))

(define-relation assigned-to WorkOrder Technician
  (:field [assigned-to/assigned-at Instant {:required true}]))

(define-action assign-work-order
  (:input [workOrder String {:required true}])
  (:input [technician String {:required true}])
  (:returns String)
  (:do (changes
    (clear workOrder :work-order/status)
    (set workOrder :work-order/status "assigned")
    (link assigned-to workOrder technician {:assigned-to/assigned-at now}))))

(define-datalog-query assigned-work
  (:query
    {:find ["?title" "?technician"]
     :where
       [["?work" ":work-order/title" "?title"]
        ["?work" ":work-order/status" "?status"]
        ["!=" "?status" "cancelled"]
        ["not" ["?work" ":work-order/status" "archived"]]
        ["?assignment" ":assigned-to/from" "?work"]
        ["?assignment" ":assigned-to/to" "?person"]
        ["?assignment" ":assigned-to/assigned-at" "?assignedAt"]
        ["?person" ":technician/name" "?technician"]]}))

(define-datalog-query unassigned-work
  (:query {:find ["?workOrder" "?title"]
           :where [["?workOrder" ":work-order/title" "?title"]
                   ["?workOrder" ":work-order/status" "open"]]}))

(define-datalog-query technicians
  (:query {:find ["?technician" "?name"]
           :where [["?technician" ":technician/name" "?name"]]}))

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
