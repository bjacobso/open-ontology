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
