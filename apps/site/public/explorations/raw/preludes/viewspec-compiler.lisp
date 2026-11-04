; viewspec-compiler.lisp
; -----------------------------------------------------------------------------
; Hosted ViewSpec compiler hooks.
;
; These hooks implement validation behavior for ontology forms whose semantics
; depend on the hosted ViewSpec DSL.
; -----------------------------------------------------------------------------

(meta-fn view/validate
  (:kind validate)
  (:input FormMetaInput)
  (:output DiagnosticList)
  (:doc "Type-checks the view layout tree against the ViewSpec component catalog.")
  (:body
    (let [layout-expr (meta/slot-expr input :layout)]
      (let [state-forms (meta/child-forms input :state)
            state-info (into (list/map state-forms
              (fn [sf]
                [(meta/identifier sf :name)
                 (if (meta/slot-string sf :type)
                   (meta/slot-string sf :type)
                   "any")])))
            main-query (meta/slot-string input :query)
            nq-forms (meta/child-forms input :named-query)
            nq-names (list/map nq-forms
              (fn [nq] (meta/identifier nq :name)))
            all-query-names (if (nil? main-query)
              nq-names
              (conj nq-names main-query))
            input-forms (meta/child-forms input :input-param)
            input-names (list/map input-forms
              (fn [inf] (meta/identifier inf :name)))
            def-forms (meta/child-forms input :def)
            def-names (list/map def-forms
              (fn [df] (meta/identifier df :name)))]
        (if (nil? layout-expr)
          []
          (meta/validate-descriptor-tree
            "viewspec"
            layout-expr
            state-info
            all-query-names
            input-names
            def-names))))))
