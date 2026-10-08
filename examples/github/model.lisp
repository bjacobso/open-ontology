(import "/github")

; Join the hosting layer to the shared Git graph, including cross-fork PRs.
(define-datalog-query github-open-pull-requests
  (:query
    {:find ["?repository" "?number" "?author" "?base" "?headRepository" "?head"]
     :where [["?pr" ":github-pull-request/state" "open"]
             ["?pr" ":github-pull-request/repository" "?hosting"]
             ["?hosting" ":github-repository/full-name" "?repository"]
             ["?pr" ":github-pull-request/number" "?number"]
             ["?pr" ":github-pull-request/author" "?account"]
             ["?account" ":github-account/login" "?author"]
             ["?pr" ":github-pull-request/base" "?baseBranch"]
             ["?baseBranch" ":git-branch/name" "?base"]
             ["?pr" ":github-pull-request/head" "?headBranch"]
             ["?headBranch" ":git-branch/name" "?head"]
             ["?headBranch" ":git-branch/repository" "?headRepo"]
             ["?headHosting" ":github-repository/repository" "?headRepo"]
             ["?headHosting" ":github-repository/full-name" "?headRepository"]]}))
