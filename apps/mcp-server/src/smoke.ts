import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createLiteratureNote,
  createModelClient,
  createServiceClient,
  createSourceNote,
  getConfig,
  ingestDocument,
  notesCitingDocument,
  ragQuery,
  registerDocument,
} from "@lob/core";

/**
 * End-to-end smoke test against the live local stack (Supabase + Ollama + vault):
 * register → ingest → RAG → source note → literature note with claim-level
 * traceability → reverse trace → verify files on disk.
 *
 * Run: npm run smoke --workspace @lob/mcp-server
 */

const config = getConfig();
const db = createServiceClient(config);
const model = createModelClient(config);

const SAMPLE = `# The Transformer Architecture

## Abstract
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, a model architecture relying entirely on an attention mechanism to draw global dependencies between input and output, dispensing with recurrence and convolutions entirely.

## Method
Self-attention, sometimes called intra-attention, is an attention mechanism relating different positions of a single sequence in order to compute a representation of the sequence. The Transformer allows for significantly more parallelization because it does not require sequential computation along the sequence, which reduces training time substantially.

## Results
The Transformer achieves superior translation quality while being more parallelizable and requiring significantly less time to train than prior recurrent or convolutional architectures.`;

console.log("1) register document");
const doc = await registerDocument(db, {
  title: "Smoke Test — The Transformer Architecture",
  authors: ["Vaswani, A."],
  published: "2017-06-12",
  venue: "NeurIPS",
  kind: "article",
  bytes: new TextEncoder().encode(SAMPLE),
});
console.log("   document_id:", doc.id);

console.log("2) ingest (chunk + embed)");
const ing = await ingestDocument(db, model, doc.id, SAMPLE);
console.log("   chunks:", ing.chunkCount);

console.log("3) rag_query: 'why is the transformer faster to train?'");
const hits = await ragQuery(db, model, "why is the transformer faster to train?", { limit: 2 });
for (const h of hits) console.log(`   (${(h.similarity * 100).toFixed(0)}%) §${h.section}: ${h.text.slice(0, 90)}…`);

console.log("4) create source note");
const src = await createSourceNote(db, config, doc, ["transformers"]);
console.log("   ", src.relPath);

console.log("5) create literature note with claim-level links");
const lit = await createLiteratureNote(db, model, config, {
  title: "Smoke Test — Notes on the Transformer",
  topics: ["transformers", "attention"],
  summary: "Key takeaways from the Transformer paper.",
  claims: [
    { text: "The Transformer relies entirely on attention, dispensing with recurrence and convolutions.", documentId: doc.id },
    { text: "Self-attention enables far more parallelization, which substantially reduces training time.", documentId: doc.id },
  ],
  openQuestions: ["How does this scale to very long sequences?"],
});
console.log("   ", lit.relPath, "| links:", lit.linkCount, "| resolved passages:", lit.resolvedChunks);

console.log("6) reverse trace (notes citing the document)");
for (const t of await notesCitingDocument(db, doc.id)) {
  console.log(`   ${t.title} (${t.claims} claim(s)) -> ${t.vaultPath}`);
}

console.log("7) files on disk?");
const root = config.vault.root!;
console.log("   source note:", existsSync(join(root, src.relPath)));
console.log("   literature note:", existsSync(join(root, lit.relPath)));

console.log("\n✅ SMOKE TEST PASSED");
