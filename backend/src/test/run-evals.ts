 
/**
 * Eval runner (skeleton).
 *
 * Target design (proven in the previous project, see
 * docs/guia-codificacion-backend.md §9):
 *  - Fresh agent per dataset item with intercepted tools (write tools mocked,
 *    read tools pass-through with tracing).
 *  - LLM-as-judge scorers (createScorer from @mastra/core/evals, cheap judge
 *    model) + programmatic tool-call matcher.
 *  - Results persisted to SQLite; quality gates per dataset threshold.
 *  - Gated datasets for LegalSeller: source fidelity (no invented citations),
 *    legal correctness, rules compliance.
 *
 * Implement together with the first real dataset in src/test/agents/consultas/datasets/.
 */

console.log("Eval runner not implemented yet. See docs/guia-codificacion-backend.md §9 for the target design.");
process.exit(1);
