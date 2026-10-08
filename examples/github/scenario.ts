import { readFileSync } from "node:fs";
import { Effect } from "effect";
import { KvTriples, Triples } from "@triplex-build/triplex";
import { elaborateFormaOntology, makeOntologyRuntime } from "../../src/index.js";

export const githubSource = readFileSync(new URL("./model.lisp", import.meta.url), "utf8");

/** Synthetic local facts: no GitHub credentials or network access required. */
export const runGitHubScenario = () => {
  const runtime = makeOntologyRuntime(elaborateFormaOntology(githubSource, { name: "github", version: "1" }));
  return Effect.runPromise(Effect.gen(function* () {
    const triples = yield* Triples;
    const invoke = (action: string, input: Readonly<Record<string, unknown>>) =>
      runtime.invoke(action, input, { actor: "agent:modeler", now: 1_800_000_000_000 });

    for (const [repository, name] of [["git:ontology", "ontology"], ["git:fork", "ontology-fork"], ["git:forma", "forma"]]) {
      yield* invoke("git-create-repository", { repository, name });
    }
    for (const [account, nodeId, login, kind] of [
      ["github:org", "ORG_demo", "example-org", "organization"],
      ["github:ada", "USER_ada", "ada", "user"],
    ]) {
      yield* invoke("github-record-account", { account, nodeId, login, kind });
    }
    for (const [hosting, nodeId, repository, owner, fullName] of [
      ["github:ontology", "REPO_ontology", "git:ontology", "github:org", "example-org/ontology"],
      ["github:fork", "REPO_fork", "git:fork", "github:ada", "ada/ontology"],
    ]) {
      yield* invoke("github-record-repository", { hosting, nodeId, repository, owner, fullName, url: `https://github.com/${fullName}` });
    }
    yield* invoke("git-record-fork", { fork: "git:fork", upstream: "git:ontology" });
    yield* invoke("git-record-dependency", { repository: "git:ontology", dependency: "git:forma" });
    yield* invoke("github-record-membership", { account: "github:ada", organization: "github:org", role: "member" });
    yield* invoke("github-record-collaborator", { repository: "github:ontology", account: "github:ada", permission: "write" });

    // Full synthetic object ids; the root commit is shared by both repositories.
    for (const [suffix, message] of [["a", "Initial model"], ["b", "Add imports"], ["c", "Merge imports"]]) {
      const oid = suffix!.repeat(40);
      yield* invoke("git-record-commit", { commit: `git:sha1:${oid}`, oid, objectFormat: "sha1", message });
    }
    const root = `git:sha1:${"a".repeat(40)}`;
    const change = `git:sha1:${"b".repeat(40)}`;
    const merge = `git:sha1:${"c".repeat(40)}`;
    yield* invoke("git-record-parent", { commit: change, parent: root, position: 0 });
    yield* invoke("git-record-parent", { commit: merge, parent: root, position: 0 });
    yield* invoke("git-record-parent", { commit: merge, parent: change, position: 1 });
    for (const [branch, repository, name, tip] of [
      ["branch:ontology:main", "git:ontology", "main", root],
      ["branch:fork:main", "git:fork", "main", root],
      ["branch:fork:imports", "git:fork", "imports", change],
    ]) {
      yield* invoke("git-create-branch", { branch, repository, name, tip });
    }
    yield* invoke("git-set-default-branch", { repository: "git:ontology", branch: "branch:ontology:main" });
    yield* invoke("git-set-default-branch", { repository: "git:fork", branch: "branch:fork:main" });
    yield* invoke("github-open-issue", { issue: "issue:ontology:1", repository: "github:ontology", number: 1, title: "Reusable Git vocabulary", author: "github:ada" });
    // Issue numbers are repository-scoped: the fork also has an issue #1.
    yield* invoke("github-open-issue", { issue: "issue:fork:1", repository: "github:fork", number: 1, title: "Fork housekeeping", author: "github:ada" });
    yield* invoke("github-open-pull-request", { pullRequest: "pr:ontology:2", repository: "github:ontology", number: 2, title: "Add Git and GitHub libraries", author: "github:ada", base: "branch:ontology:main", head: "branch:fork:imports" });
    yield* invoke("github-reference-issue", { pullRequest: "pr:ontology:2", issue: "issue:ontology:1" });
    // Moving one main branch must leave the fork's main branch unchanged.
    yield* invoke("git-move-branch", { branch: "branch:ontology:main", tip: merge });

    return {
      "github-repositories": (yield* runtime.query("github-repositories")).results,
      "github-forks": (yield* runtime.query("github-forks")).results,
      "git-repository-dependencies": (yield* runtime.query("git-repository-dependencies")).results,
      "git-branch-tips": (yield* runtime.query("git-branch-tips")).results,
      "github-open-pull-requests": (yield* runtime.query("github-open-pull-requests")).results,
      "github-pull-request-issues": (yield* runtime.query("github-pull-request-issues")).results,
      "merge-parents": (yield* triples.queryAll({
        find: ["?oid", "?position"],
        where: [["?edge", ":git-parent/from", merge], ["?edge", ":git-parent/to", "?parent"],
          ["?edge", ":git-parent/position", "?position"], ["?parent", ":git-commit/oid", "?oid"]],
        orderBy: [{ variable: "?position", direction: "asc" }],
      })).results,
      collaborators: (yield* triples.queryAll({
        find: ["?login", "?permission", "?role"],
        where: [["?edge", ":github-collaborator/from", "github:ontology"],
          ["?edge", ":github-collaborator/to", "?account"], ["?edge", ":github-collaborator/permission", "?permission"],
          ["?account", ":github-account/login", "?login"], ["?member", ":github-member-of/from", "?account"],
          ["?member", ":github-member-of/to", "github:org"], ["?member", ":github-member-of/role", "?role"]],
      })).results,
    };
  }).pipe(Effect.provide(KvTriples.layer)));
};
