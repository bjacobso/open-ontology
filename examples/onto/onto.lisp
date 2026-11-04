; onto.lisp: an OntoLang-shaped prelude for Forma.
;
; Seven forms: project, actor, object, rule, formula, story (with step children), seed.
; Every expression hole (requires, rule, formula) is type-checked by Forma's inference
; against a record view of the declared object, so reservation.room-class.rate is
; checked by type, not by string lookup.

; Forma keyword-in-lambda workaround: monomorphic is? (upstream fix: https://github.com/bjacobso/forma/pull/110).
; ── Vocabulary: what every condition and formula may call ──
(type Instant (Brand String))
; (One X) is a link to an X; (Many X) is X[] in OntoLang.
(type (One a) a)
(type (Many a) (List a))
(define
  onto/vocabulary
  {:= (quote (-> a a Bool))
   :is? (quote (-> Keyword Keyword Bool))
   :now (quote Instant)
   :before? (quote (-> Instant Instant Bool))
   :after? (quote (-> Instant Instant Bool))
   :days-between (quote (-> Instant Instant Int))
   :known? (quote (-> a Bool))
   :in? (quote (-> a (List a) Bool))
   :sum (quote (-> (List Int) Int))})

; ── Helpers over authored data ──
(define name-of [x] (if (nil? x) "" (if (keyword? x) (keyword/name x) (str x))))
(define same? [a b] (= (name-of a) (name-of b)))
(define member? [x xs] (some (fn [y] (same? x y)) xs))
(define pairs [r] (if (nil? r) [] (if (map? r) (meta/entries r) r)))
(define lookup [record k] (let [hit (first (filter (fn [[f t]] (same? f k)) (pairs record)))] (if (nil? hit) nil (nth hit 1))))
(define head-name [x] (if (and (list? x) (not (empty? x))) (name-of (first x)) ""))
(define diag [code message slot] {:severity :error :code code :message message :slot slot})
(define warn [code message slot] {:severity :warning :code code :message message :slot slot})

; (One X) is a link, (Many X) is X[] in OntoLang, (Union :a :b) is a | b.
(define link-target [ty] (if (or (= (head-name ty) "One") (= (head-name ty) "Many")) (nth ty 1) nil))
(define many? [ty] (= (head-name ty) "Many"))
(define states-of [ty] (if (= (head-name ty) "Union") (rest ty) nil))
(define declared-noun? [x] (or (member? x (declarations-of (quote object))) (member? x (declarations-of (quote actor)))))

; Formulas show up on their object's view as if they were fields.
(define
  formulas-for
  [owner]
  (filter (fn [f] (same? (declaration-hole f :of) owner)) (declarations-of (quote formula))))

; What a reference to an object looks like to an expression: a record of its fields
; and formulas, following links `depth` levels deep.
(define
  view-of
  [owner depth]
  (merge
    (reduce
      (fn
        [acc [k ty]]
        (assoc acc (keyword (name-of k)) (lift ty depth)))
      {}
      (pairs (declaration-fields owner)))
    (reduce
      (fn [acc f] (assoc acc (keyword (name-of (declaration-hole f :field))) (declaration-hole f :returns)))
      {}
      (formulas-for owner))))
(define
  lift
  [ty depth]
  (let
    [target (link-target ty)]
    (if (not (nil? (states-of ty)))
      (quote Keyword)
      (if (nil? target)
        ty
        (let
          [v (if (> depth 0) (view-of target (- depth 1)) (quote String))]
          (if (many? ty) [(sym "List") v] v))))))
(define
  scope-for
  [owner]
  (merge onto/vocabulary {(keyword (lower (name-of owner))) (view-of owner 3)}))

; Follow a dotted path from an object: (path-type Reservation ["room-class" "rate"]) → Int.
(define
  path-type
  [owner parts]
  (let
    [ty (lookup (declaration-fields owner) (first parts))]
    (if (or (nil? ty) (= (count parts) 1))
      ty
      (let [target (link-target ty)] (if (nil? target) nil (path-type target (rest parts)))))))
; (is? reservation.status :confirmd): the keyword must be one of that field's states.
(define
  states/check
  [owner e slot]
  (if (and (list? e) (= (head-name e) "is?") (= (count e) 3) (symbol? (nth e 1)) (keyword? (nth e 2)))
    (let
      [parts (split (name-of (nth e 1)) ".")
       ty (if (same? (first parts) (lower (name-of owner))) (path-type owner (rest parts)) nil)
       states (if (nil? ty) nil (states-of ty))]
      (if (or (nil? states) (member? (nth e 2) states))
        []
        [(diag "onto/unknown-state"
           (str ":" (name-of (nth e 2)) " is not a state of " (name-of (nth e 1)) "; it is one of "
                (reduce (fn [acc x] (str acc (if (= acc "") "" ", ") ":" (name-of x))) "" states) ".")
           slot)]))
    (if (list? e) (flat-map (fn [x] (states/check owner x slot)) e) [])))

; ── project ──
(type ProjectIR {:kind "Project" :name Symbol :doc String})
(form
  (project name doc)
  "Names the model."
  :types {:name (Declares Project) :doc String}
  :ir ProjectIR
  {:kind "Project" :name name :doc doc})

; ── actor / object ──
(type FieldIR {:name String :type Syntax :link (Option Symbol) :many Bool :states (Option (List Keyword)) :final (List Keyword)})
(define
  fields->ir
  [fields final]
  (map
    (fn
      [[k ty]]
      {:name (name-of k)
       :type ty
       :link (link-target ty)
       :many (many? ty)
       :states (states-of ty)
       :final (filter (fn [s] (member? s (pairs (states-of ty)))) (pairs (lookup final k)))})
    (pairs fields)))
(define
  links/check
  [{:keys [fields]}]
    (flat-map
      (fn
        [[k ty]]
        (let
          [target (link-target ty)]
          (if (and (not (nil? target)) (not (declared-noun? target)))
            [(diag "onto/unknown-link" (str (name-of k) " links to " (name-of target) ", which is not an actor or object.") :fields)]
            [])))
      (pairs fields)))
(define
  finals/check
  [{:keys [fields final]}]
    (flat-map
      (fn
        [[k finals]]
        (let
          [ty (lookup fields k)]
          (if (nil? (states-of ty))
            [(diag "onto/final-not-states" (str (name-of k) " is not a list of states, so it has no final ones.") :final)]
            (flat-map
              (fn
                [s]
                (if (member? s (states-of ty))
                  []
                  [(diag "onto/unknown-state" (str ":" (name-of s) " is not a state of " (name-of k) ".") :final)]))
              finals))))
      (pairs final)))

(type ActorIR {:kind "Actor" :name Symbol :actor-type Keyword :doc String :joins Keyword :fields (List FieldIR)})
(form
  (actor name actor-type doc {:keys [joins]} fields)
  "Someone, or something, that takes part in the work."
  :types {:name (Declares Actor) :actor-type (Union :person :system) :doc String
          :joins (Option (Union :sign-up :invite :none)) :fields (Record Type)}
  :check links/check
  :ir ActorIR
  {:kind "Actor" :name name :actor-type actor-type :doc doc
   :joins (if (nil? joins) (if (= actor-type :system) :none :invite) joins)
   :fields (fields->ir fields {})})

(type ObjectIR {:kind "Object" :name Symbol :doc String :fields (List FieldIR)})
(form
  (object name doc {:keys [final]} fields)
  "A record the business keeps track of."
  :types {:name (Declares Object) :doc String :final (Option Syntax) :fields (Record Type)}
  :check (fn [holes] (concat (links/check holes) (finals/check holes)))
  :ir ObjectIR
  {:kind "Object" :name name :doc doc :fields (fields->ir fields (if (nil? final) {} final))})

; ── rule: holds whichever story runs ──
(type RuleIR {:kind "Rule" :name Symbol :of Symbol :doc String :holds RuntimeExpr})
(form
  (rule name of doc holds)
  "Something that must always be true of every record of an object."
  :types {:name (Declares Rule) :of (Refers Object) :doc String :holds (Expr Bool)}
  :scope {:holds (fn [{:keys [of]}] (scope-for of))}
  :check (fn [{:keys [of holds]}] (states/check of holds :holds))
  :ir RuleIR
  {:kind "Rule" :name name :of of :doc doc :holds holds})

; ── formula: worked out, never typed in ──
(type FormulaIR {:kind "Formula" :of Symbol :field Symbol :returns Type :doc String :body RuntimeExpr})
(form
  (formula of field returns doc body)
  "A derived field on an object."
  :types {:of (Refers Object) :field (Declares FormulaField) :returns Type :doc String :body (Expr returns)}
  :scope {:body (fn [{:keys [of]}] (scope-for of))}
  :check (fn [{:keys [of body]}] (states/check of body :body))
  :ir FormulaIR
  {:kind "Formula" :of of :field field :returns returns :doc doc :body body})

; ── story and its steps: Actor verb Object :to/:for Actor, requires, sets ──
(type SetIR {:field String :value Keyword})
(type StepIR {:kind "Step" :actor Symbol :verb Symbol :object Symbol :counterpart (Option Symbol)
              :creates Bool :requires (List RuntimeExpr) :sets (List SetIR)})
(type story-child StepIR)

(define state-field [object] (first (filter (fn [[k ty]] (not (nil? (states-of ty)))) (pairs (declaration-fields object)))))
(define field-type [object field] (lookup (declaration-fields object) field))

; Every keyword-ish field name an expression mentions (reservation.status → :status).
(define
  flatten-keys
  [e]
  (if (symbol? e)
    (map (fn [p] (keyword p)) (rest (split (name-of e) ".")))
    (if (list? e) (flat-map flatten-keys e) [])))

(define
  step/check
  [{:keys [actor verb object to for new requires sets]}]
  (concat
    (if (and (not (nil? to)) (not (nil? for)))
      [(diag "onto/two-counterparts" "A step says :to or :for, not both." :for)]
      [])
    (flat-map
      (fn
        [[field value]]
        (let
          [ty (field-type object field)]
          (if (nil? ty)
            [(diag "onto/unknown-field" (str (name-of object) " has no field " (name-of field) ".") :sets)]
            (if (nil? (states-of ty))
              []
              (if (member? value (states-of ty))
                ; A step that moves a status without saying what it moves *from* could
                ; move a record out of a final state.
                (if (or new (some (fn [r] (member? (keyword (name-of field)) (flatten-keys r))) (pairs requires)))
                  []
                  [(warn "onto/unguarded-transition"
                     (str (name-of actor) " " (name-of verb) " " (name-of object) " sets " (name-of field) " to :" (name-of value)
                          " without requiring its current state, so it could leave a final state. Add a requires on "
                          (lower (name-of object)) "." (name-of field) ", or :new true if this step creates the record.")
                     :sets)])
                [(diag "onto/unknown-state" (str ":" (name-of value) " is not a state of " (name-of object) "." (name-of field) ".") :sets)])))))
      (pairs sets))))
(form
  (story-child/step actor verb object {:keys [to for new requires sets]})
  "One sentence of a story: who does what, to what."
  :types {:actor (Refers Actor) :verb Symbol :object (Refers Object)
          :to (Option (Refers Actor)) :for (Option (Refers Actor)) :new (Option Bool)
          :requires (Option (List (Expr Bool))) :sets (Option Syntax)}
  :scope {:requires (fn [{:keys [object]}] (scope-for object))}
  :check (fn [holes] (concat (step/check holes) (states/check (get holes :object) (get holes :requires) :requires)))
  :ir StepIR
  {:kind "Step" :actor actor :verb verb :object object
   :counterpart (if (nil? to) for to)
   :creates (if (nil? new) false new)
   :requires (if (nil? requires) [] requires)
   :sets (map (fn [[k v]] {:field (name-of k) :value v}) (pairs sets))})

(type StoryIR {:kind "Story" :name Symbol :doc String :steps (List StepIR)})
(form
  (story name doc child ...)
  "A run of sentences describing one piece of work."
  :types {:name (Declares Story) :doc String :child (List story-child)}
  :ir StoryIR
  {:kind "Story" :name name :doc doc :steps child})

; ── seed: the records a new app starts with ──
(type SeedIR {:kind "Seed" :of Symbol :rows Syntax})
(form
  (seed of rows)
  "Starting records for an object."
  :types {:of (Refers Object) :rows Syntax}
  :check
    (fn
      [{:keys [of rows]}]
      (flat-map
        (fn
          [row]
          (flat-map
            (fn [[k v]] (if (nil? (field-type of k)) [(diag "onto/unknown-field" (str (name-of of) " has no field " (name-of k) ".") :rows)] []))
            (pairs row)))
        rows))
  :ir SeedIR
  {:kind "Seed" :of of :rows rows})
