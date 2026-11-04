# Support desk

A Forma-only model exercises object creation, clear-then-set updates, references,
relations, negation, ordering and grouped aggregates. It uses the bundled
ontology language; there is no separate support-desk prelude.

## Read and run

- Language: [ontology.lisp](../../preludes/ontology.lisp), with [construction hooks](../../preludes/ontology-compiler.lisp).
- Model: [model.lisp](model.lisp).
- Operations: [run.ts](run.ts).
- Run: `pnpm example:support-desk`.
- Check: `pnpm model:check examples/support-desk/model.lisp`.
- Coverage and checked output: [agent-guide.test.ts](../../test/agent-guide.test.ts) and [agent guide](../../apps/site/public/llms-full.txt).

The run opens three synthetic tickets, escalates one, closes another and prints
three Datalog query results from local in-memory Triplex. There is no durable
server, product authorization or external help-desk integration.
