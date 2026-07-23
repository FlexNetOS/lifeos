import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_RAW_CHUNK_BYTES,
  MEMOIR_NAME,
  SOURCE_BYTES,
  SOURCE_LINES,
  SOURCE_SHA256,
  buildIngestionPlan,
  reconcileGraph,
  reconcileMemories,
  sha256,
  storeMemoryArgs,
  verifyCascadeSegments
} from "../scripts/ingest-architecture-blueprint-icm.mjs";

describe("architecture blueprint ICM ingestion plan", () => {
  const plan = buildIngestionPlan();

  it("uses the PostgreSQL ICM backend without an out-of-band metadata writer", () => {
    const script = fs.readFileSync(
      path.join(process.cwd(), "scripts/ingest-architecture-blueprint-icm.mjs"),
      "utf8"
    );

    expect(script).toContain('ICM_DB_BACKEND: "postgres"');
    expect(script).toContain("postgresql://");
    expect(script).toContain("/home/flexnetos/.nix-profile/toolbin/psql");
    expect(script).not.toContain("INSERT INTO icm_metadata");
  });

  it("reconstructs all 6,340 lines and every exact source byte", () => {
    const reconstructed = Buffer.from(
      plan.chunks.map((chunk) => chunk.raw).join(""),
      "utf8"
    );

    expect(reconstructed).toHaveLength(SOURCE_BYTES);
    expect(reconstructed.toString("utf8").match(/\n/g)).toHaveLength(
      SOURCE_LINES
    );
    expect(sha256(reconstructed)).toBe(SOURCE_SHA256);
    expect(
      Math.max(
        ...plan.chunks.map((chunk) =>
          Buffer.byteLength(chunk.raw, "utf8")
        )
      )
    ).toBeLessThanOrEqual(MAX_RAW_CHUNK_BYTES);
  });

  it("maps all named sections and only explicit heading containment", () => {
    expect(plan.sectionCount).toBe(105);
    expect(plan.namedSectionCount).toBe(104);
    expect(plan.concepts).toHaveLength(104);
    expect(plan.relations).toHaveLength(103);
    expect(new Set(plan.relations.map((relation) => relation.relation))).toEqual(
      new Set(["part-of"])
    );

    for (const relation of plan.relations) {
      expect(relation.evidence.basis).toBe("Markdown heading containment");
      expect(relation.evidence.parent_heading_level).toBeLessThan(
        relation.evidence.child_heading_level
      );
      expect(relation.evidence.parent_source_line).toBeLessThan(
        relation.evidence.child_source_line
      );
    }
  });

  it("associates concepts with chunk topics and classifies normative sections", () => {
    const concept = plan.concepts.find((candidate) =>
      candidate.name.includes("HARD EXECUTION RULES")
    );
    const hardRuleMemory = plan.memories.find(
      (memory) => memory.topic === concept?.topic
    );
    const redbMemory = plan.memories.find((memory) =>
      memory.keywords.includes("redb")
    );
    const envctlMemory = plan.memories.find((memory) =>
      memory.keywords.includes("envctl")
    );

    expect(concept?.importance).toBe("critical");
    expect(concept?.labels).toContain(`topic:${concept.topic}`);
    expect(hardRuleMemory?.importance).toBe("critical");
    expect(redbMemory).toBeDefined();
    expect(envctlMemory).toBeDefined();
    expect(plan.memoir.name).toBe(MEMOIR_NAME);
  });

  it("is logically idempotent and rejects field drift", () => {
    const stored = plan.memories.map((memory, index) => ({
      id: `memory-${index}`,
      topic: memory.topic,
      summary: memory.summary,
      raw: memory.raw,
      keywords: memory.keywords,
      importance: memory.importance,
      embedding_dim: 1152
    }));
    const exact = reconcileMemories(plan.memories, stored);
    expect(exact.missing).toHaveLength(0);
    expect(exact.unexpected).toHaveLength(0);
    expect(exact.drift).toHaveLength(0);

    const changed = structuredClone(stored);
    changed[0].raw = `${changed[0].raw}drift`;
    expect(reconcileMemories(plan.memories, changed).drift).toContain(
      `${plan.memories[0].logicalId}.raw`
    );
  });

  it("passes leading-hyphen raw bytes as one unambiguous CLI argument", () => {
    const args = storeMemoryArgs({
      topic: "topic",
      summary: "summary",
      raw: "- exact Markdown list item\n",
      keywords: ["markdown"],
      importance: "medium"
    });

    expect(args).toContain("--raw=- exact Markdown list item\n");
    expect(args).not.toContain("--raw");
  });

  it("verifies both independently normalized cascade segments", () => {
    const vector = Array.from({ length: 1152 }, () => 0);
    vector[0] = 1;
    vector[384] = 1;

    expect(
      verifyCascadeSegments([{ logical_id: "memory", embedding: vector }])
    ).toMatchObject({
      verified_vectors: 1,
      fast_384d_norm: { min: 1, max: 1 },
      primary_768d_norm: { min: 1, max: 1 }
    });

    const invalid = [...vector];
    invalid[384] = 0.5;
    expect(() =>
      verifyCascadeSegments([{ logical_id: "memory", embedding: invalid }])
    ).toThrow(/not unit length/);
  });

  it("recognizes an exact exported graph as a no-op", () => {
    const graph = {
      memoir: plan.memoir,
      concepts: plan.concepts.map((concept, index) => ({
        id: `concept-${index}`,
        name: concept.name,
        definition: concept.definition,
        labels: concept.labels
      })),
      links: plan.relations.map((relation, index) => ({
        id: `relation-${index}`,
        source: relation.from,
        target: relation.to,
        relation: relation.relation.replaceAll("-", "_"),
        weight: 1
      }))
    };
    const result = reconcileGraph(plan, graph);

    expect(result.memoirMissing).toBe(false);
    expect(result.missingConcepts).toHaveLength(0);
    expect(result.missingRelations).toHaveLength(0);
    expect(result.unexpectedConcepts).toHaveLength(0);
    expect(result.unexpectedRelations).toHaveLength(0);
    expect(result.drift).toHaveLength(0);
  });
});
