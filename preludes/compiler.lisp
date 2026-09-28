; compiler.lisp
; -----------------------------------------------------------------------------
; Self-describing compiler prelude for the Lisp DSL.
;
; This file defines the meta-level forms that the compiler uses to understand
; language constructs. These are compiler infrastructure, not ontology semantics.
;
; Forms defined here:
;   define-form, meta-fn, syntax, identifier, slot, bind, validate, elaborate,
;   construct-fn, bindings-fn, result-type-fn, validate-fn
;
; Plus: the descriptor-construct generic meta hook, worked examples of
; meta-fn bodies, and the minimal canonical helper vocabulary spec.
;
; Any domain (ontology, hardware description, etc.) can define its own
; forms using these meta constructs.
;
; How to read this file:
; - A `define-form` declares one Lisp head and the shape of its arguments.
; - `:identifiers` are positional values immediately after the head.
; - `:slots` are keyword clauses such as `(:field ...)` or `(:returns ...)`.
; - `:bindings-fn`, `:validate-fn`, `:construct-fn`, and `:result-type-fn`
;   name compile-time hooks implemented in a companion compiler prelude.
; - Most ontology authors do not write these forms directly. They explain
;   how authoring forms like `define-entity` are recognized and lowered.
;
; Status: executable (parsed by lisp-v2, meta-fn bodies run at compile time)
; -----------------------------------------------------------------------------

; =============================================================================
; SECTION 1 — SELF-DESCRIBING META LAYER
; =============================================================================
;
; These are the forms the ontology prelude would need in order to describe its
; own forms. They are the "maximally needed" POC layer for self-description.
;
; Unclear point:
; - whether these should literally be ordinary `(form ...)` declarations in the
;   final system, or come from an even smaller kernel bootstrap seed.
; - likely answer: tiny kernel seed bootstraps these, then these bootstrap the
;   rest of ontology.lisp.

(define-form form
  (:doc "Defines a canonical DSL form descriptor.")
  (:phase meta)
  (:identifiers
    [name Symbol {:declaration true}])
  (:slots
    [phase value]
    [doc value]
    [syntax form {:many true}]
    [identifiers form {:many true}]
    [slots form {:many true}]
    [typed form {:many true}]
    [bindings form {:many true}]
    [validation form {:many true}]
    [elaborates form {:many true}]
    [construct value]
    [meta value]
    [declaration-type value]
    [result-type value])
  (:bindings-fn form-definition-bindings)
  (:validate-fn form-definition-validate)
  (:construct-fn form-definition-construct)
  (:result-type-fn form-definition-result-type)

  ; Unsure:
  ; - whether :construct here should directly emit FormDescriptor
  ;   or a higher-level MetaFormDefinition that later lowers into descriptor.
  ; - I suspect a two-step lowering is cleaner.
  )

; `meta-fn` is the bridge from declarative syntax descriptors to executable
; compiler behavior. Domain preludes use it to say "when this form appears,
; run this pure compile-time function to infer bindings, validate slots, choose
; a result type, or construct IR."
(define-form meta-fn
  (:doc "Declares a pure compile-time meta hook.")
  (:phase meta)
  (:identifiers
    [name Symbol {:declaration true}])
  (:slots
    [kind value {:required true}]
    [input value {:required true}]
    [output value {:required true}]
    [capabilities value {:many true}]
    [doc value]
    [body expr {:required true}])
  (:validate-fn meta-fn-validate)
  (:construct-fn meta-fn-construct)
  (:result-type-fn meta-fn-result-type))

(define-form syntax
  (:doc "Declares surface heads and aliases for a form.")
  (:phase meta)
  (:slots
    [head value {:many true}]
    [alias value {:many true}])
  (:construct-fn descriptor-construct)
  (:result-type (constant SyntaxDescriptor)))

; Positional identifiers are the non-keyword arguments after a form head.
; Example: in `(define-entity Employee ...)`, `Employee` is the `name`
; identifier declared by the `define-entity` descriptor.
(define-form identifier
  (:doc "Declares a positional identifier for a form.")
  (:phase meta)
  (:identifiers
    [name Symbol]
    [kind Symbol])
  (:slots
    [declaration value]
    [doc value])
  (:construct-fn descriptor-construct)
  (:result-type (constant IdentifierDescriptor)))

; Slots are keyword clauses inside a form. A required slot must be present.
; A many slot can appear more than once. Child-form metadata lets a repeated
; slot parse compact nested forms such as `(:field [employee/name String])`.
(define-form slot
  (:doc "Declares a named slot for a form.")
  (:phase meta)
  (:identifiers
    [name Symbol]
    [kind Symbol])
  (:slots
    [required value]
    [many value]
    [alias value {:many true}]
    [doc value]
    [type value]
    [type-from value])
  (:construct-fn descriptor-construct)
  (:result-type (constant SlotDescriptor)))

(define-form bind
  (:doc "Static binding opcode inside a form descriptor.")
  (:phase meta)
  (:identifiers
    [kind Symbol])
  (:slots
    [name value]
    [slot value]
    [as value]
    [type value]
    [identifier value])
  (:construct-fn descriptor-construct)
  (:result-type (constant BindingOpcode)))

(define-form validate
  (:doc "Static validation opcode inside a form descriptor.")
  (:phase meta)
  (:identifiers
    [kind Symbol])
  (:slots
    [slot value]
    [values value {:many true}]
    [collection value]
    [default-slot value]
    [list-slot value])
  (:construct-fn descriptor-construct)
  (:result-type (constant ValidationOpcode)))

(define-form elaborate
  (:doc "Static elaboration/lowering opcode inside a form descriptor.")
  (:phase meta)
  (:identifiers
    [kind Symbol])
  (:slots
    [slot value]
    [form value]
    [target value]
    [declaration-kind value]
    [binding-name value]
    [collection value]
    [default-slot value]
    [list-slot value]
    [values value {:many true}])
  (:construct-fn descriptor-construct)
  (:result-type (constant LoweringOpcode)))

(define-form construct-fn
  (:doc "References a named construct meta function.")
  (:phase meta)
  (:identifiers
    [name Symbol])
  (:construct-fn descriptor-construct)
  (:result-type (constant MetaHookReference)))

(define-form bindings-fn
  (:doc "References a named bindings meta function.")
  (:phase meta)
  (:identifiers
    [name Symbol])
  (:construct-fn descriptor-construct)
  (:result-type (constant MetaHookReference)))

(define-form result-type-fn
  (:doc "References a named result-type meta function.")
  (:phase meta)
  (:identifiers
    [name Symbol])
  (:construct-fn descriptor-construct)
  (:result-type (constant MetaHookReference)))

(define-form validate-fn
  (:doc "References a named validate meta function.")
  (:phase meta)
  (:identifiers
    [name Symbol])
  (:construct-fn descriptor-construct)
  (:result-type (constant MetaHookReference)))

; ----------------------------------------------------------------------------
; Generic meta hooks the ontology prelude would want available.
; ----------------------------------------------------------------------------

(meta-fn descriptor-construct
  (:kind construct)
  (:input FormConstructInput)
  (:output ConstructObject)
  (:doc "Generic constructor that interprets static descriptor :construct fields.")
  (:body
    ; See Section 4 for the real implementation
    nil))


; Worked example: generic descriptor-backed construct hook

(meta-fn descriptor-construct
  (:kind construct)
  (:input FormConstructInput)
  (:output ConstructObject)
  (:doc "Interprets descriptor-authored construct fields in a restricted way.")
  (:body
    (construct/from-descriptor
      :input input
      :env (meta/semantic-env input))))


; =============================================================================
; SECTION 5 — MINIMAL CANONICAL HELPER VOCABULARY
; =============================================================================
;
; This section lists the smallest helper surface I currently think the kernel +
; meta substrate would need in order to support the worked examples above.
;
; Goal:
; - enough power for full self-description and bootstrapping
; - not enough power to become an unconstrained compiler plugin API
;
; -----------------------------------------------------------------------------
; 5A. Input model helpers
; -----------------------------------------------------------------------------
;
; These helpers expose structured views of the current compile-time input.
; They should be preferred over direct access to raw normalized/compiler internals.
;
; Core meta/input helpers:
; - (meta/descriptor input)
; - (meta/form-name input)
; - (meta/declaration-name input)
; - (meta/loc input)
; - (meta/normalized-form input)
; - (meta/semantic-env input)
;
; Slot/identifier access:
; - (meta/slot-value input :slot)
; - (meta/slot-values input :slot)
; - (meta/slot-string input :slot)
; - (meta/slot-string-list input :slot)
; - (meta/slot-symbol input :slot)
; - (meta/slot-expr input :slot)
; - (meta/slot-ref input :slot DeclarationKind)
; - (meta/identifier input :name)
;
; Child-form traversal:
; - (meta/child-forms input :slot)
; - (meta/child-form input :slot)
; - (meta/child-identifier-set input :slot :identifier)
;
; Generic declaration reflection:
; - (meta/lookup-declaration input name)
; - (meta/declaration-kind declaration)
; - (meta/declaration-type declaration)
; - (meta/declaration-field declaration field-name)
; - (meta/project-type declaration [field ...])
;
; Unclear / maybe too low-level:
; - exposing raw normalized maps or raw declaration indexes directly
; - likely should stay internal to TypeScript
;
; -----------------------------------------------------------------------------
; 5B. Type helpers
; -----------------------------------------------------------------------------
;
; These helpers let meta functions describe HM results without constructing raw
; TS runtime objects directly.
;
; Minimal type helpers:
; - (type/unknown)
; - (type/constant Name)
; - (type/list T)
; - (type/vector T)
; - (type/record [field type] ...)
; - (type/ref Name)
; - (type/project-row row [field ...])
;
; Type-check query helpers:
; - (meta/expr-assignable-to? input expr Type)
; - maybe later: (meta/infer-expr-type input expr)
;
; -----------------------------------------------------------------------------
; 5C. Binding helpers
; -----------------------------------------------------------------------------
;
; These helpers construct validated binding payloads.
;
; Minimal binding helpers:
; - (bindings/empty)
; - (bindings/of [name Type] ...)
; - (bindings/merge a b ...)
;
; Possibly useful later:
; - (bindings/when condition payload)
;
; -----------------------------------------------------------------------------
; 5D. Construct helpers
; -----------------------------------------------------------------------------
;
; These helpers produce structured elaboration payloads.
;
; Minimal construct helpers:
; - (construct/from-descriptor ...)
; - (construct/object ...)
;
; -----------------------------------------------------------------------------
; 5E. Diagnostic helpers
; -----------------------------------------------------------------------------
;
; These helpers produce structured diagnostics without exposing TS internals.
;
; Minimal diagnostic helpers:
; - (diag/error :message "...")
; - (diag/error :slot :where :message "...")
; - (diag/error :form child-form :message "...")
; - (diag/concat a b ...)
; - (diag/validate-membership-list values allowed :slot :slot-name)
; - (diag/validate-default-in-list default values :slot :slot-name)
;
; Likely useful:
; - (diag/warning ...)
; - (diag/info ...)
;
; -----------------------------------------------------------------------------
; 5F. Small safe collection/string helpers
; -----------------------------------------------------------------------------
;
; These are probably the maximum general-purpose helpers we should allow.
;
; Collections:
; - (empty? xs)
; - (list/flat-map xs fn)
; - (list/map xs fn)
; - (list/filter xs fn)
; - (set/contains? set value)
;
; Strings:
; - (str a b c ...)
;
; Control flow:
; - let
; - if
; - small local fn
;
; I would avoid for now:
; - unrestricted recursion
; - macros in meta-fn bodies
; - arbitrary higher-order library imports
; - mutation
;
; -----------------------------------------------------------------------------
; 5G. Probably kernel-owned vs ontology-owned
; -----------------------------------------------------------------------------
;
; Kernel-owned generic helpers:
; - meta/input access primitives
; - binding constructors
; - type constructors
; - construct protocol dispatch
; - diagnostic constructors
; - tiny safe collection/string helpers
;
; This separation is important.
; The kernel should host DSLs; the ontology prelude should define ontology logic.
;
; -----------------------------------------------------------------------------
; 5H. Bootstrap minimum
; -----------------------------------------------------------------------------
;
; If we work backwards from this file, the smallest trusted bootstrap seed likely
; needs to support:
; - parsing S-expressions
; - reading a tiny seed descriptor for `form`
; - reading a tiny seed descriptor for `meta-fn`
; - validating structured helper calls in meta-fn bodies
; - executing constrained meta hooks
;
; After that, ontology.lisp can define the rest of its own surface.
;
