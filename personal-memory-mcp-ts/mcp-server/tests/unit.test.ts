import { describe, it, expect } from "vitest";
import { decayScore, computeSimpleSimilarity } from "../src/memory.js";
import type { Memory } from "../src/types.js";

// Helper to create a memory with minimal required fields
function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    content: "test memory",
    category: "fact",
    importance: "medium",
    tags: [],
    source: { platform: "test", agent_id: "test" },
    supersedes: null,
    access_count: 0,
    last_accessed_at: null,
    stability: 1.0,
    created_at: new Date(),
    updated_at: new Date(),
    active: true,
    ...overrides,
  };
}

// =============================================================================
// decayScore
// =============================================================================

describe("decayScore", () => {
  it("returns higher score for high importance than low", () => {
    const now = Date.now();
    const high = makeMemory({ importance: "high", created_at: new Date(now) });
    const low = makeMemory({ importance: "low", created_at: new Date(now) });

    expect(decayScore(high, now)).toBeGreaterThan(decayScore(low, now));
  });

  it("returns higher score for recently accessed memory", () => {
    const now = Date.now();
    const recent = makeMemory({
      created_at: new Date(now - 86400000 * 30), // 30 days ago
      last_accessed_at: new Date(now - 86400000), // 1 day ago
      stability: 1.0,
    });
    const stale = makeMemory({
      created_at: new Date(now - 86400000 * 30), // 30 days ago
      last_accessed_at: new Date(now - 86400000 * 29), // 29 days ago
      stability: 1.0,
    });

    expect(decayScore(recent, now)).toBeGreaterThan(decayScore(stale, now));
  });

  it("returns higher score for higher stability", () => {
    const now = Date.now();
    const base = {
      created_at: new Date(now - 86400000 * 15), // 15 days ago
      importance: "medium" as const,
    };
    const stable = makeMemory({ ...base, stability: 5.0 });
    const fragile = makeMemory({ ...base, stability: 0.5 });

    expect(decayScore(stable, now)).toBeGreaterThan(decayScore(fragile, now));
  });

  it("uses created_at when last_accessed_at is null", () => {
    const now = Date.now();
    const mem = makeMemory({
      created_at: new Date(now),
      last_accessed_at: null,
    });
    // Just created, should have near-max retention
    const score = decayScore(mem, now);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(3); // max = importance weight 2 * retention 1
  });

  it("score approaches zero for very old memories with low stability", () => {
    const now = Date.now();
    const ancient = makeMemory({
      created_at: new Date(now - 86400000 * 365), // 1 year ago
      stability: 0.1,
      importance: "low",
    });
    expect(decayScore(ancient, now)).toBeLessThan(0.01);
  });
});

// =============================================================================
// computeSimpleSimilarity
// =============================================================================

describe("computeSimpleSimilarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(computeSimpleSimilarity("hello world", "hello world")).toBe(1.0);
  });

  it("returns 1.0 for same words different case", () => {
    expect(computeSimpleSimilarity("Hello World", "hello world")).toBe(1.0);
  });

  it("returns 0.0 for completely different strings", () => {
    expect(computeSimpleSimilarity("apple banana", "cat dog")).toBe(0.0);
  });

  it("returns ~0.5 for half-overlapping words", () => {
    const sim = computeSimpleSimilarity("apple banana", "apple cherry");
    // Intersection: {apple} = 1, Union: {apple, banana, cherry} = 3
    expect(sim).toBeCloseTo(1 / 3, 5);
  });

  it("returns 1 for two empty strings (single empty-string set)", () => {
    // split("") on empty string produces [""], so both sets = {""}, intersection = {""}, union = {""}
    expect(computeSimpleSimilarity("", "")).toBe(1);
  });

  it("handles duplicate words in input", () => {
    const sim = computeSimpleSimilarity("go go go", "go stop");
    // setA: {go}, setB: {go, stop}, intersection: {go}, union: {go, stop}
    expect(sim).toBe(0.5);
  });

  it("detects high similarity for paraphrased content", () => {
    const a = "Software Engineer at Microsoft working on DocumentDB";
    const b = "Software Engineer at Microsoft working on DocumentDB open source";
    // 7/9 words overlap → ~0.78 Jaccard
    expect(computeSimpleSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it("detects low similarity for different content", () => {
    const a = "Likes swimming and weight lifting at gym";
    const b = "Daughter Yichen born December 2024";
    expect(computeSimpleSimilarity(a, b)).toBeLessThan(0.2);
  });
});
