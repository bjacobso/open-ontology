; /std/git — provider-neutral Git graph and repository connections.
; Commit ids identify objects by object format + full oid, across repositories.
; Branch ids are repository-scoped; names such as main are not global ids.
; TODO: enforce reference existence, branch/repository consistency and acyclic ancestry.
; These actions record local facts; they do not execute Git commands.

(define-entity GitRepository
  (:doc "A logical Git repository, independent of its hosting provider.")
  (:field [git-repository/name String {:required true}])
  (:field [git-repository/default-branch GitBranch]))

(define-entity GitCommit
  (:doc "A Git commit object, shared by repositories that contain the same object.")
  (:field [git-commit/oid String {:required true}])
  ; Conventional values: sha1, sha256. Strings are not enums in v0.1.
  (:field [git-commit/object-format String {:required true}])
  (:field [git-commit/message String {:required true}]))

(define-entity GitBranch
  (:doc "A repository-scoped branch with a replaceable tip commit.")
  (:field [git-branch/repository GitRepository {:required true}])
  (:field [git-branch/name String {:required true}])
  (:field [git-branch/tip GitCommit {:required true}]))

; A merge commit can have multiple parents; position records their order.
(define-relation git-parent GitCommit GitCommit
  (:field [git-parent/position Int {:required true}]))

; Direction: fork -> upstream, dependent -> dependency.
; Dependencies are modeled project facts, not intrinsic Git object data.
(define-relation git-fork-of GitRepository GitRepository)
(define-relation git-depends-on GitRepository GitRepository)

(define-action git-create-repository
  (:input [repository String {:required true}])
  (:input [name String {:required true}])
  (:returns String)
  (:do (create GitRepository repository {:git-repository/name name})))

(define-action git-record-commit
  (:input [commit String {:required true}])
  (:input [oid String {:required true}])
  (:input [objectFormat String {:required true}])
  (:input [message String {:required true}])
  (:returns String)
  (:do (create GitCommit commit
    {:git-commit/oid oid :git-commit/object-format objectFormat :git-commit/message message})))

(define-action git-create-branch
  (:input [branch String {:required true}])
  (:input [repository String {:required true}])
  (:input [name String {:required true}])
  (:input [tip String {:required true}])
  (:returns String)
  (:do (create GitBranch branch
    {:git-branch/repository repository :git-branch/name name :git-branch/tip tip})))

(define-action git-move-branch
  (:input [branch String {:required true}])
  (:input [tip String {:required true}])
  (:returns String)
  (:do (changes
    (clear branch :git-branch/tip)
    (set branch :git-branch/tip tip))))

(define-action git-set-default-branch
  (:input [repository String {:required true}])
  (:input [branch String {:required true}])
  (:returns String)
  (:do (changes
    (clear repository :git-repository/default-branch)
    (set repository :git-repository/default-branch branch))))

(define-action git-record-parent
  (:input [commit String {:required true}])
  (:input [parent String {:required true}])
  (:input [position Int {:required true}])
  (:returns String)
  (:do (link git-parent commit parent {:git-parent/position position})))

(define-action git-record-fork
  (:input [fork String {:required true}])
  (:input [upstream String {:required true}])
  (:returns String)
  (:do (link git-fork-of fork upstream {})))

(define-action git-record-dependency
  (:input [repository String {:required true}])
  (:input [dependency String {:required true}])
  (:returns String)
  (:do (link git-depends-on repository dependency {})))

(define-datalog-query git-branch-tips
  (:query
    {:find ["?repository" "?branch" "?oid"]
     :where [["?b" ":git-branch/repository" "?r"]
             ["?r" ":git-repository/name" "?repository"]
             ["?b" ":git-branch/name" "?branch"]
             ["?b" ":git-branch/tip" "?c"]
             ["?c" ":git-commit/oid" "?oid"]]}))

(define-datalog-query git-repository-dependencies
  (:query
    {:find ["?repository" "?dependency"]
     :where [["?edge" ":git-depends-on/from" "?r"]
             ["?edge" ":git-depends-on/to" "?d"]
             ["?r" ":git-repository/name" "?repository"]
             ["?d" ":git-repository/name" "?dependency"]]}))
