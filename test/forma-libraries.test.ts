import { describe, expect, it } from "vitest";
import { compileFormaOntology, elaborateFormaOntology, formaLibrarySources, materializeOntology, ontologyToIR, toTriplexConfig } from "../src/index.js";
import { checkFormaSource, checkModelFile } from "../scripts/check-model.js";
import { githubSource, runGitHubScenario } from "../examples/github/scenario.js";

describe("bundled Forma libraries", () => {
  it.each(Object.keys(formaLibrarySources))("checks %s with zero warnings", (path) => {
    const checked = checkFormaSource(`(import "${path}")`, { name: "library" });
    expect(checked.ok).toBe(true);
    expect(checked.diagnostics).toEqual([]);
    const ir = checked.ir!;
    expect(JSON.parse(JSON.stringify(ir))).toEqual(ir);
    expect(ontologyToIR(materializeOntology(ir))).toEqual(ir);
    expect(toTriplexConfig(ir).objectTypes.size).toBe(ir.objectTypes.length);
  });

  it("loads transitive and repeated imports once, with no state shared between models", () => {
    const options = { name: "github" };
    const ir = elaborateFormaOntology('(import "/github")', options);
    expect(elaborateFormaOntology('(import "/std/git") (import "/github") (import "/std/git") (import "/github")', options)).toEqual(ir);
    expect(elaborateFormaOntology('(import "/github")', options)).toEqual(ir);
    expect(compileFormaOntology('(import "/github")', options).objectTypes.size).toBe(7);
    expect(elaborateFormaOntology("", options).objectTypes).toEqual([]);
  });

  it.each(['(import)', '(import /github)', '(import "/github" :as gh)', '(import ["/github"])'])(
    "rejects malformed import %s at its original line", (form) => {
      expect(checkFormaSource(`; model\n${form}`, { name: "invalid" }).diagnostics).toEqual([
        { severity: "error", message: 'An ontology import must be (import "/library-path")', line: 2, col: 1 },
      ]);
    },
  );

  it.each(["/gitlab", "../libraries/github.lisp", "toString", "https://example.com/library"])(
    "rejects unknown library %s without resolving a file or URL", (path) => {
      expect(checkFormaSource(`(import "${path}")`, { name: "invalid" }).diagnostics).toEqual([
        { severity: "error", message: `Unknown ontology library ${path}`, line: 1, col: 1 },
      ]);
    },
  );

  it("preserves caller locations after an import and rejects redeclaring imported types", () => {
    expect(checkFormaSource('(import "/github")\n\n(define-relation broken Missing GitRepository)', { name: "invalid" }).diagnostics).toEqual([
      { severity: "error", message: "Link broken has unknown endpoints Missing -> GitRepository", line: 3, col: 1 },
    ]);
    expect(checkFormaSource('(import "/std/git")\n(define-entity GitRepository)', { name: "invalid" }).diagnostics).toEqual([
      { severity: "error", message: "Duplicate ontology declaration GitRepository", line: 2, col: 1 },
    ]);
  });

  it("lets another provider compose the shared Git types without GitHub", () => {
    const result = checkFormaSource(`(import "/std/git")
(define-entity GitLabProject
  (:field [gitlab-project/path String {:required true}])
  (:field [gitlab-project/repository GitRepository {:required true}]))
(define-relation gitlab-mirror GitLabProject GitRepository)`, { name: "gitlab-draft" });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.ir!.objectTypes.map(({ name }) => name)).toEqual(["GitRepository", "GitCommit", "GitBranch", "GitLabProject"]);
    const project = materializeOntology(result.ir!).objectTypes.get("GitLabProject")!;
    expect(project.properties.repository!.target?.name).toBe("GitRepository");
  });
});

describe("GitHub graph", () => {
  it("checks the example through both the source and file APIs", async () => {
    const result = await checkModelFile("examples/github/model.lisp", { name: "github" });
    expect(result).toEqual(checkFormaSource(githubSource, { name: "github" }));
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("runs cross-fork PRs, scoped branches and issues, dependencies and merge ancestry", async () => {
    const result = await runGitHubScenario();
    expect(result["github-repositories"]).toEqual(expect.arrayContaining([
      { "?repository": "example-org/ontology", "?owner": "example-org", "?url": "https://github.com/example-org/ontology" },
      { "?repository": "ada/ontology", "?owner": "ada", "?url": "https://github.com/ada/ontology" },
    ]));
    expect(result["github-repositories"]).toHaveLength(2);
    expect(result["github-forks"]).toEqual([{ "?fork": "ada/ontology", "?upstream": "example-org/ontology" }]);
    expect(result["git-repository-dependencies"]).toEqual([{ "?repository": "ontology", "?dependency": "forma" }]);
    expect(result["git-branch-tips"]).toHaveLength(3);
    expect(result["git-branch-tips"]).toEqual(expect.arrayContaining([
      { "?repository": "ontology", "?branch": "main", "?oid": "c".repeat(40) },
      { "?repository": "ontology-fork", "?branch": "main", "?oid": "a".repeat(40) },
      { "?repository": "ontology-fork", "?branch": "imports", "?oid": "b".repeat(40) },
    ]));
    expect(result["github-open-pull-requests"]).toEqual([
      { "?repository": "example-org/ontology", "?number": 2, "?author": "ada", "?base": "main", "?headRepository": "ada/ontology", "?head": "imports" },
    ]);
    expect(result["github-pull-request-issues"]).toEqual([
      { "?repository": "example-org/ontology", "?pullRequest": 2, "?issueRepository": "example-org/ontology", "?issue": 1, "?title": "Reusable Git vocabulary" },
    ]);
    expect(result["merge-parents"]).toEqual([
      { "?oid": "a".repeat(40), "?position": 0 },
      { "?oid": "b".repeat(40), "?position": 1 },
    ]);
    expect(result.collaborators).toEqual([{ "?login": "ada", "?permission": "write", "?role": "member" }]);
  });
});
