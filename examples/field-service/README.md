# Field service

The same work-order model is authored in TypeScript and Forma. A test compares
their portable `OntologyIR`. The language is the package's bundled ontology
prelude; there is no separate field-service language prelude.

## Read and run

- Language: [ontology.lisp](../../preludes/ontology.lisp), with [construction hooks](../../preludes/ontology-compiler.lisp).
- Model: [model.lisp](model.lisp) or [model.ts](model.ts).
- Operations: [run.ts](run.ts).
- Run: `pnpm example`.
- Check: `pnpm model:check examples/field-service/model.lisp`.
- Coverage: [field-service.test.ts](../../test/field-service.test.ts).

The run seeds a technician and work order, invokes `assign-work-order` and
prints `assigned-work` from local in-memory Triplex. Facts and actor ids are
synthetic; this does not provide persistence, a server or authorization.
