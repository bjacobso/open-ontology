# Git and GitHub

A reusable provider-neutral Git vocabulary and GitHub hosting vocabulary,
loaded as bundled Forma libraries. These are declarations in the existing
ontology language, not a new language or live provider integration.

## Read and run

- Language: [ontology.lisp](../../preludes/ontology.lisp).
- Libraries: [std/git.lisp](../../libraries/std/git.lisp) and [github.lisp](../../libraries/github.lisp).
- Model: [model.lisp](model.lisp).
- Operations: [scenario.ts](scenario.ts) and [run.ts](run.ts).
- Vocabulary and extension conventions: [Git libraries guide](../../docs/git-libraries.md).
- Run: `pnpm example:github`.
- Check: `pnpm model:check examples/github/model.lisp`.
- Coverage: [forma-libraries.test.ts](../../test/forma-libraries.test.ts).

The scenario models synthetic forks, dependencies, merge parents, a cross-fork
pull request and issue references. It runs on local in-memory Triplex, with no
GitHub API synchronization, configuration deployment or permission enforcement.
