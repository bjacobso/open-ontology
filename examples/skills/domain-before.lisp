(define-entity Technician
  (:field [technician/name String {:required true}]))

(define-entity WorkOrder
  (:field [work-order/title String {:required true}])
  (:field [work-order/status String {:required true}])
  (:field [work-order/trade String {:required true}])
  (:field [work-order/min-level Int {:required true}])
  (:field [work-order/match-at Instant {:required true}]))

(define-entity Certification
  (:field [certification/code String {:required true}]))

(define-relation qualified-in Technician Certification
  (:field [qualified-in/level Int {:required true}])
  (:field [qualified-in/expires-at Instant {:required true}]))

(define-datalog-query eligible-technicians
  (:query
    {:find ["?workOrder" "?technician" "?name" "?level"]
     :where [["?workOrder" ":work-order/trade" "?trade"]
             ["?workOrder" ":work-order/min-level" "?minimum"]
             ["?workOrder" ":work-order/match-at" "?at"]
             ["?certification" ":certification/code" "?trade"]
             ["?grant" ":qualified-in/from" "?technician"]
             ["?grant" ":qualified-in/to" "?certification"]
             ["?grant" ":qualified-in/level" "?level"]
             ["?grant" ":qualified-in/expires-at" "?expiry"]
             ["?technician" ":technician/name" "?name"]
             [">=" "?level" "?minimum"]
             [">" "?expiry" "?at"]]}))
