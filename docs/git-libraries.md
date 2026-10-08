# Git and GitHub libraries

These experimental v0.1 libraries describe a local graph. They use the same Forma declarations, portable JSON IR, and in-memory Triplex runtime as other models.

```lisp
(import "/github")
```

This imports [the GitHub source](https://raw.githubusercontent.com/bjacobso/open-ontology/main/libraries/github.lisp), which imports [the shared Git source](https://raw.githubusercontent.com/bjacobso/open-ontology/main/libraries/std/git.lisp). Use `(import "/std/git")` alone when modeling Git without GitHub.

```sh
pnpm model:check examples/github/model.lisp --name github
pnpm example:github
```

## Import contract

Imports take exactly one string naming a bundled library. The available paths are `/std/git` and `/github`; `/gitlab` is a future extension. Relative paths, URLs, aliases, and arbitrary file imports are unsupported. Every library loads once per model, including transitive imports. Importing both `/github` and `/std/git` is safe. All declarations share one namespace: callers can reference imported types and fields, but cannot redefine them.

`elaborateFormaOntology` and `compileFormaOntology` accept imports, as does `pnpm model:check`. The public `formaLibrarySources` registry exposes the bundled source text for inspection. Import expansion keeps caller line numbers intact; library errors identify their library path. Imports disappear into ordinary declarations in the IR. The package includes `libraries/` alongside `preludes/` and exports the raw files at `@open-ontology/ontology/libraries/*`.

## Shared vocabulary: /std/git

| Declaration | Meaning |
| --- | --- |
| `GitRepository` | Logical repository, with a name and optional default-branch reference |
| `GitCommit` | Commit object with its full object id, object format, and message |
| `GitBranch` | Branch name scoped to a repository, with a current tip commit |
| `git-parent` | Child commit → parent commit, with a zero-based parent position |
| `git-fork-of` | Fork repository → upstream repository |
| `git-depends-on` | Dependent repository → dependency repository; a modeled project connection |

The actions are `git-create-repository`, `git-record-commit`, `git-create-branch`, `git-move-branch`, `git-set-default-branch`, `git-record-parent`, `git-record-fork`, and `git-record-dependency`. `git-move-branch` and `git-set-default-branch` clear the previous reference before setting its replacement. The queries are `git-branch-tips` and `git-repository-dependencies`.

A commit object is independent of the repository that contains it. Branches in a fork and an upstream repository can point to the same commit id. Multiple `git-parent` edges represent merge commits, with `position` retaining the order of the parents. This follows [Git's object and ancestry model](https://git-scm.com/docs/user-manual).

## Hosting vocabulary: /github

| Declaration | Meaning |
| --- | --- |
| `GitHubAccount` | User or organization, with stable node id, login, and kind |
| `GitHubRepository` | Hosting record with node id, shared Git repository reference, owner, full name, and URL |
| `GitHubIssue` | Repository-scoped issue number, title, author, and state |
| `GitHubPullRequest` | Repository-scoped PR number, title, author, base/head branches, state, and merged flag |
| `github-member-of` | Account → organization, with descriptive role |
| `github-collaborator` | GitHub hosting record → account, with descriptive permission |
| `github-references-issue` | PR → issue; a reference does not assert that the issue closes |

The actions are `github-record-account`, `github-record-repository`, `github-open-issue`, `github-open-pull-request`, `github-record-membership`, `github-record-collaborator`, and `github-reference-issue`. The bundled queries are `github-repositories`, `github-forks`, and `github-pull-request-issues`. The example adds `github-open-pull-requests`, joining the hosting layer to the shared branch graph.

A PR's `repository` is its base GitHub hosting record. Its `base` and `head` point to shared Git branches; the head branch may belong to a fork. GitHub's [pull request API](https://docs.github.com/en/rest/pulls/pulls) similarly carries separate base and head repository/ref data. A PR is modeled separately from an issue here; GitHub's overlapping API representation is not reproduced. Issue references can cross repositories, so the query returns both repository names as well as the numbers.

## Identity and writes

The caller supplies object ids. Suggested conventions:

- Git repositories: a stable local id such as `git:ontology`, independent of a mutable provider path.
- Commits: `git:<object-format>:<full-oid>`, such as `git:sha1:<40-hex-characters>`; never an abbreviated oid.
- Branches: `branch:<repository-id>:<branch-name>`; two repositories can both have `main`.
- GitHub accounts and hosting records: ids derived from provider node ids. Store mutable logins and full names as fields.
- Issues and PRs: ids incorporating the stable hosting id and the repository-local number. An issue `#1` in a fork is distinct from upstream issue `#1`.

The scenario uses short readable ids and synthetic node ids to keep its fixtures legible. Names, formats, and ids are conventions, not uniqueness or enum constraints. Record/create actions assert facts; repeating them with changed fields retains the old values. To model a rename or state transition, add an action using `clear` followed by `set`. Repeated relation pairs reuse the same link id and can accumulate field values.

## Extending to another provider

Another provider should reference the existing `GitRepository`, `GitBranch`, and `GitCommit` types rather than copying them. For example, this draft works today without importing GitHub:

```lisp
(import "/std/git")

(define-entity GitLabProject
  (:field [gitlab-project/path String {:required true}])
  (:field [gitlab-project/repository GitRepository {:required true}]))
```

To bundle a `/gitlab` library later, add its Lisp source and registry entry in `src/forma-libraries.ts`, then test its imports and runtime joins. Keep provider accounts, namespaces, merge requests, and API metadata in that library. Existing Git queries can then run against its shared repositories and branches.

## Current limits

Actions record local facts; they do not run Git or call GitHub. There is no importer, webhook listener, synchronization, durable storage, or authorization. Memberships and collaborator permissions are data only. Reference existence, enum values, repo-local number uniqueness, parent ordering, acyclic ancestry, and a PR's base/repository consistency are not enforced. Branches represent current pointers, not historical PR commit snapshots. Link removal, teams, reviews, checks, releases, and merge/close workflows are outside this first vocabulary.
