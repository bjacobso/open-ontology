# Example-only Forma package

`open-ontology-onto-forma-0.3.0-onto.535cd41e.tgz` is an MIT-licensed build of
[Forma commit 535cd41ec7f81f3229b810df6f374ebfa04c16c7](https://github.com/bjacobso/forma/commit/535cd41ec7f81f3229b810df6f374ebfa04c16c7),
resolved from latest `main` on November 4, 2026, and packaged under `@open-ontology/onto-forma` as a development dependency for
`examples/onto/`. It is not an official Forma release or a package feature.
The original license is inside the tarball.

Why: the npm `@formalang/ts@0.3.0` tarball pinned by this repository predates
`elaborateSources`, `preludeSource`, and unified `form` descriptors. Upstream
still identifies this newer source as 0.3.0. The supplied Onto prelude uses that
newer API. Keeping a separate package preserves the package's existing Forma
bridge and makes frozen installs self-contained. No sibling project source is
imported. This snapshot includes the upstream compiler fixes from Forma PR 110; the
supplied monomorphic `is?` workaround is retained for source compatibility. Remove this dependency when a suitable official
release is available.

## Rebuild

Use Node 24 and this repository's locked tsdown 0.20.0 toolchain. In a temporary
source checkout at the exact commit above, run the repository's tsdown binary
from `packages/ts` with `--config ../../tsdown.config.ts`. The generated prelude
source is checked in upstream; no generation step is needed.

Before `npm pack`, change only the package metadata: set name to
`@open-ontology/onto-forma`, version to `0.3.0-onto.535cd41e`, remove `scripts`
and `devDependencies`, set `files` to `["dist", "LICENSE"]`, and copy the root
MIT `LICENSE` into `packages/ts`. Pack with `npm pack --pack-destination` pointing
to this directory, then run `pnpm install` to refresh tarball integrity in the
lockfile. The compiled source itself is unmodified. The golden IR, nine negative
diagnostic variants and complete story test verify the consumed API.
