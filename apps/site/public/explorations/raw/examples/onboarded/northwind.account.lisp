; Northwind: one Onboarded account, end to end, in one file.
;
; Illustrative and synthetic. The Forma reader parses this file; the example's account
; elaborator checks it, lowers it to directional resource IR, and simulates its scenarios.
; Nothing here calls Onboarded or deploys configuration.
;
;   pnpm account:check examples/onboarded/northwind.account.lisp

(account northwind "Northwind Logistics"
  :languages [:en :es]
  :sender "onboarding@northwind.example"
  :support "people@northwind.example"
  :dedupe [employee.email])

; ── Attributes: built-in entities, extended with typed fields ────────────────────────────

(attributes client
  (region (one-of :west "West" :east "East") "Region" :scope)
  (requires-drug-screen boolean "Requires drug screen"))

(attributes job
  (site-type (one-of :warehouse "Warehouse" :office "Office") "Site type" :searchable)
  (hourly-rate decimal "Hourly rate"))

(attributes placement
  (union-local (one-of :local-42 "Local 42" :local-77 "Local 77" :none "Not represented")
    "Union local" :searchable)
  (weekly-hours integer "Scheduled weekly hours"))

(attributes employee
  (badge-number string "Badge number" :searchable :pattern "^NW-[0-9]{6}$")
  (union-card-number string "Union card number" :sensitive)
  (mailing-address address "Mailing address")
  (forklift-certified-on date "Forklift certification date")
  (legacy-hris-id string "Legacy HRIS ID" :deprecated "Replaced by badge-number"))

; ── Rules: named, three-valued, usable by policies, forms, automations, and access ───────

(rule at-warehouse (= job.site-type :warehouse))

(rule union-covered
  (and (not= placement.union-local :none)
       (>= placement.weekly-hours 20)))

(def dues-rate (/ 1.5 100))   ; build-time arithmetic, inlined as 0.015

; ── Forms: fields bind attributes or form answers; reads and writes are inferred ─────────

(form w4 :from "onboarded.compliance" :key "irs.w-4")

(form union-card "Union card"
  :due-in 30
  (page "Union membership" :employee
    (checkbox has-card "I already hold a union card" :es "Ya tengo una tarjeta sindical")
    (text employee.union-card-number "Union card number" :required :show-if has-card)
    (address employee.mailing-address "Mailing address" :required)
    (formula weekly-dues "Estimated weekly dues"
      (round (* job.hourly-rate placement.weekly-hours dues-rate) 2))
    (signature employee-signature))
  (page "Steward review" :employer
    (review [employee.union-card-number weekly-dues])
    (signature steward-signature)))

(form site-safety "Globex site safety" :key "northwind.globex.site-safety"
  (page "Site rules" :employee
    (checkbox acknowledged "I have read the Globex site safety rules" :required)
    (signature employee-signature)))

(form forklift-certification "Forklift certification"
  (page "Certification" :employee
    (date employee.forklift-certified-on "Certification date" :required)))

(form drug-screen-consent "Drug screen consent"
  (page "Consent" :employee
    (content "I consent to a pre-placement drug screen.")
    (signature consent-signature)))

; ── Policies: when a placement matches, require forms ────────────────────────────────────

(policy warehouse-onboarding "Warehouse onboarding"
  :when at-warehouse
  :require [w4 site-safety
            (drug-screen-consent :when client.requires-drug-screen)])

(policy union-card-obligation "Union card"
  :when union-covered
  :require [union-card])

; ── Automations: a trigger, then steps ───────────────────────────────────────────────────

(param overdue-template :sendgrid-template "Supplied per target account.")

(automation union-card-reminder "Union card reminder"
  :on (task-created union-card)
  (wait 2 :days :after task.due-at)
  (when (not= task.status :completed)
    (email :employee overdue-template "Your union card is overdue"
      "Hi {{ employee.first_name }}, please complete your union card.")))

(automation forklift-follow-up "Request forklift certification"
  :on (placement-created)
  (when (and at-warehouse (missing? employee.forklift-certified-on))
    (assign forklift-certification)))

; ── Access and integrations ──────────────────────────────────────────────────────────────

(group west-managers "West region managers"
  :can [:placement/read :employee/read :task/read :task/edit]
  :sees (= client.region :west))

(integration checkr "@onboarded-platform/checkr@1.4.0"
  :connection "checkr"
  :package "driver_pro"
  :adjudication :manual)

; ── Scenarios: facts in, outcomes out; every decision covered both ways ──────────────────

(scenario "warehouse, Local 42, full time"
  {job.site-type :warehouse placement.union-local :local-42
   placement.weekly-hours 32 client.requires-drug-screen false}
  (expect :policies [warehouse-onboarding union-card-obligation]
          :forms [w4 site-safety union-card]
          :tasks [w4 site-safety union-card forklift-certification]))

(scenario "certified driver, drug screen required"
  {job.site-type :warehouse placement.union-local :none
   client.requires-drug-screen true employee.forklift-certified-on "2026-03-14"}
  (expect :policies [warehouse-onboarding]
          :forms [w4 site-safety drug-screen-consent]
          :tasks [w4 site-safety drug-screen-consent]))

(scenario "office, not represented"
  {job.site-type :office placement.union-local :none}
  (expect :policies [] :forms [] :tasks []))

(scenario "union local recorded on day five"
  {job.site-type :office placement.weekly-hours 32}
  (expect :forms [] :unknown {union-card-obligation [placement.union-local]})
  (day 5 (record placement.union-local :local-42)
         (expect :policies [union-card-obligation] :tasks [union-card])))

(scenario "Ada returns her union card on day ten"
  {employee.first-name "Ada" job.site-type :office
   placement.union-local :local-42 placement.weekly-hours 32}
  (day 10 (complete union-card))
  (day 40 (expect :open [] :emails [])))

(scenario "Ben's union card goes overdue"
  {employee.first-name "Ben" job.site-type :office
   placement.union-local :local-77 placement.weekly-hours 24}
  (day 31 (expect :emails []))
  (day 32 (expect :open [union-card]
                  :emails [{:to :employee :body "Hi Ben, please complete your union card."}])))
