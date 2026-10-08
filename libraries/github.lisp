; /github — GitHub hosting and collaboration layered on /std/git.
; Local metadata only: no API calls, synchronization or permission enforcement.
; TODO: validate account kinds, states, repo-local numbers and PR base consistency.
; TODO: model teams, reviews, checks, releases and link removal when needed.
(import "/std/git")

(define-entity GitHubAccount
  (:doc "A GitHub user or organization, identified independently of its mutable login.")
  (:field [github-account/node-id String {:required true}])
  (:field [github-account/login String {:required true}])
  ; Conventional values: user, organization.
  (:field [github-account/kind String {:required true}]))

(define-entity GitHubRepository
  (:doc "A GitHub hosting record for a provider-neutral Git repository.")
  (:field [github-repository/node-id String {:required true}])
  (:field [github-repository/repository GitRepository {:required true}])
  (:field [github-repository/owner GitHubAccount {:required true}])
  (:field [github-repository/full-name String {:required true}])
  (:field [github-repository/url String {:required true}]))

(define-entity GitHubIssue
  (:doc "An issue number scoped to its GitHub repository.")
  (:field [github-issue/repository GitHubRepository {:required true}])
  (:field [github-issue/number Int {:required true}])
  (:field [github-issue/title String {:required true}])
  (:field [github-issue/author GitHubAccount {:required true}])
  ; Conventional values: open, closed.
  (:field [github-issue/state String {:required true}]))

(define-entity GitHubPullRequest
  (:doc "A proposed change from a head branch, possibly in a fork, into a base branch.")
  (:field [github-pull-request/repository GitHubRepository {:required true}])
  (:field [github-pull-request/number Int {:required true}])
  (:field [github-pull-request/title String {:required true}])
  (:field [github-pull-request/author GitHubAccount {:required true}])
  (:field [github-pull-request/base GitBranch {:required true}])
  (:field [github-pull-request/head GitBranch {:required true}])
  ; Conventional values: open, closed; merged is a separate fact.
  (:field [github-pull-request/state String {:required true}])
  (:field [github-pull-request/merged Bool {:required true}]))

; Member -> organization. Role/permission fields are descriptive metadata.
(define-relation github-member-of GitHubAccount GitHubAccount
  (:field [github-member-of/role String {:required true}]))
(define-relation github-collaborator GitHubRepository GitHubAccount
  (:field [github-collaborator/permission String {:required true}]))
; A reference does not imply that the PR closes the issue.
(define-relation github-references-issue GitHubPullRequest GitHubIssue)

(define-action github-record-account
  (:input [account String {:required true}])
  (:input [nodeId String {:required true}])
  (:input [login String {:required true}])
  (:input [kind String {:required true}])
  (:returns String)
  (:do (create GitHubAccount account
    {:github-account/node-id nodeId :github-account/login login :github-account/kind kind})))

(define-action github-record-repository
  (:input [hosting String {:required true}])
  (:input [nodeId String {:required true}])
  (:input [repository String {:required true}])
  (:input [owner String {:required true}])
  (:input [fullName String {:required true}])
  (:input [url String {:required true}])
  (:returns String)
  (:do (create GitHubRepository hosting
    {:github-repository/node-id nodeId :github-repository/repository repository
     :github-repository/owner owner :github-repository/full-name fullName :github-repository/url url})))

(define-action github-open-issue
  (:input [issue String {:required true}])
  (:input [repository String {:required true}])
  (:input [number Int {:required true}])
  (:input [title String {:required true}])
  (:input [author String {:required true}])
  (:returns String)
  (:do (create GitHubIssue issue
    {:github-issue/repository repository :github-issue/number number
     :github-issue/title title :github-issue/author author :github-issue/state "open"})))

(define-action github-open-pull-request
  (:input [pullRequest String {:required true}])
  (:input [repository String {:required true}])
  (:input [number Int {:required true}])
  (:input [title String {:required true}])
  (:input [author String {:required true}])
  (:input [base String {:required true}])
  (:input [head String {:required true}])
  (:returns String)
  (:do (create GitHubPullRequest pullRequest
    {:github-pull-request/repository repository :github-pull-request/number number
     :github-pull-request/title title :github-pull-request/author author
     :github-pull-request/base base :github-pull-request/head head
     :github-pull-request/state "open" :github-pull-request/merged false})))

(define-action github-record-membership
  (:input [account String {:required true}])
  (:input [organization String {:required true}])
  (:input [role String {:required true}])
  (:returns String)
  (:do (link github-member-of account organization {:github-member-of/role role})))

(define-action github-record-collaborator
  (:input [repository String {:required true}])
  (:input [account String {:required true}])
  (:input [permission String {:required true}])
  (:returns String)
  (:do (link github-collaborator repository account {:github-collaborator/permission permission})))

(define-action github-reference-issue
  (:input [pullRequest String {:required true}])
  (:input [issue String {:required true}])
  (:returns String)
  (:do (link github-references-issue pullRequest issue {})))

(define-datalog-query github-repositories
  (:query
    {:find ["?repository" "?owner" "?url"]
     :where [["?r" ":github-repository/full-name" "?repository"]
             ["?r" ":github-repository/url" "?url"]
             ["?r" ":github-repository/owner" "?a"]
             ["?a" ":github-account/login" "?owner"]]}))

(define-datalog-query github-forks
  (:query
    {:find ["?fork" "?upstream"]
     :where [["?edge" ":git-fork-of/from" "?f"]
             ["?edge" ":git-fork-of/to" "?u"]
             ["?fh" ":github-repository/repository" "?f"]
             ["?fh" ":github-repository/full-name" "?fork"]
             ["?uh" ":github-repository/repository" "?u"]
             ["?uh" ":github-repository/full-name" "?upstream"]]}))

(define-datalog-query github-pull-request-issues
  (:query
    {:find ["?repository" "?pullRequest" "?issueRepository" "?issue" "?title"]
     :where [["?edge" ":github-references-issue/from" "?pr"]
             ["?edge" ":github-references-issue/to" "?i"]
             ["?pr" ":github-pull-request/repository" "?r"]
             ["?r" ":github-repository/full-name" "?repository"]
             ["?pr" ":github-pull-request/number" "?pullRequest"]
             ["?i" ":github-issue/repository" "?issueHosting"]
             ["?issueHosting" ":github-repository/full-name" "?issueRepository"]
             ["?i" ":github-issue/number" "?issue"]
             ["?i" ":github-issue/title" "?title"]]}))
