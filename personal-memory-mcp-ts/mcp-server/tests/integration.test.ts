import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoClient, Db, Collection } from "mongodb";
import type { Memory } from "../src/types.js";

/**
 * Integration tests — require a running DocumentDB/MongoDB instance.
 * Run with: DOCUMENTDB_URI=mongodb://... vitest run tests/integration.test.ts
 *
 * These tests use a dedicated test database that gets cleaned between tests.
 */

const TEST_DB = "personal_memory_test";
const DOCUMENTDB_URI = process.env.DOCUMENTDB_URI || "";

let client: MongoClient;
let db: Db;
let memoriesCol: Collection<Memory>;

// Skip if no DB available
const canConnect = async (): Promise<boolean> => {
  try {
    const c = new MongoClient(DOCUMENTDB_URI, {
      serverSelectionTimeoutMS: 3000,
    });
    await c.connect();
    await c.close();
    return true;
  } catch {
    return false;
  }
};

describe.runIf(await canConnect())("Integration: DocumentDB operations", () => {
  beforeAll(async () => {
    client = new MongoClient(DOCUMENTDB_URI);
    await client.connect();
    db = client.db(TEST_DB);
    memoriesCol = db.collection<Memory>("memories");

    // Create indexes matching production
    await memoriesCol.createIndex({
      category: 1,
      active: 1,
      created_at: -1,
    });
    await memoriesCol.createIndex({ tags: 1 });
    await memoriesCol.createIndex({ active: 1, importance: 1 });
  });

  afterAll(async () => {
    // Clean up test database
    await db.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await memoriesCol.deleteMany({});
  });

  // ---------------------------------------------------------------------------
  // Insert & Query
  // ---------------------------------------------------------------------------

  it("inserts and retrieves a memory", async () => {
    const now = new Date();
    const mem: Memory = {
      content: "Test memory content",
      category: "fact",
      importance: "high",
      tags: ["test"],
      source: { platform: "test", agent_id: "test" },
      supersedes: null,
      access_count: 0,
      last_accessed_at: null,
      stability: 1.0,
      created_at: now,
      updated_at: now,
      active: true,
    };

    const result = await memoriesCol.insertOne(mem as any);
    expect(result.insertedId).toBeDefined();

    const found = await memoriesCol.findOne({ _id: result.insertedId });
    expect(found).not.toBeNull();
    expect(found!.content).toBe("Test memory content");
    expect(found!.category).toBe("fact");
  });

  // ---------------------------------------------------------------------------
  // Tag-based search
  // ---------------------------------------------------------------------------

  it("finds memories by tag", async () => {
    const now = new Date();
    const base = {
      source: { platform: "test", agent_id: "test" },
      supersedes: null,
      access_count: 0,
      last_accessed_at: null,
      stability: 1.0,
      created_at: now,
      updated_at: now,
      active: true,
    };

    await memoriesCol.insertMany([
      {
        content: "Likes ramen",
        category: "preference",
        importance: "low",
        tags: ["food", "ramen"],
        ...base,
      } as any,
      {
        content: "Works at Microsoft",
        category: "fact",
        importance: "high",
        tags: ["career", "microsoft"],
        ...base,
      } as any,
      {
        content: "Enjoys sushi",
        category: "preference",
        importance: "low",
        tags: ["food", "sushi"],
        ...base,
      } as any,
    ]);

    const foodMemories = await memoriesCol
      .find({ tags: { $in: ["food"] }, active: true })
      .toArray();
    expect(foodMemories).toHaveLength(2);
    expect(foodMemories.map((m) => m.content)).toContain("Likes ramen");
    expect(foodMemories.map((m) => m.content)).toContain("Enjoys sushi");
  });

  // ---------------------------------------------------------------------------
  // Category filter
  // ---------------------------------------------------------------------------

  it("filters by category", async () => {
    const now = new Date();
    const base = {
      tags: [],
      source: { platform: "test", agent_id: "test" },
      supersedes: null,
      access_count: 0,
      last_accessed_at: null,
      stability: 1.0,
      created_at: now,
      updated_at: now,
      active: true,
    };

    await memoriesCol.insertMany([
      {
        content: "A fact",
        category: "fact",
        importance: "medium",
        ...base,
      } as any,
      {
        content: "A preference",
        category: "preference",
        importance: "medium",
        ...base,
      } as any,
      {
        content: "A person",
        category: "person",
        importance: "high",
        ...base,
      } as any,
    ]);

    const facts = await memoriesCol
      .find({ category: "fact", active: true })
      .toArray();
    expect(facts).toHaveLength(1);
    expect(facts[0].content).toBe("A fact");
  });

  // ---------------------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------------------

  it("soft deletes by setting active=false", async () => {
    const now = new Date();
    const result = await memoriesCol.insertOne({
      content: "To be deleted",
      category: "fact",
      importance: "low",
      tags: [],
      source: { platform: "test", agent_id: "test" },
      supersedes: null,
      access_count: 0,
      last_accessed_at: null,
      stability: 1.0,
      created_at: now,
      updated_at: now,
      active: true,
    } as any);

    await memoriesCol.updateOne(
      { _id: result.insertedId },
      { $set: { active: false, updated_at: new Date() } }
    );

    const active = await memoriesCol
      .find({ active: true })
      .toArray();
    expect(active).toHaveLength(0);

    const all = await memoriesCol.find({}).toArray();
    expect(all).toHaveLength(1);
    expect(all[0].active).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Regex search
  // ---------------------------------------------------------------------------

  it("finds memories by regex content search", async () => {
    const now = new Date();
    const base = {
      tags: [],
      source: { platform: "test", agent_id: "test" },
      supersedes: null,
      access_count: 0,
      last_accessed_at: null,
      stability: 1.0,
      created_at: now,
      updated_at: now,
      active: true,
    };

    await memoriesCol.insertMany([
      {
        content: "Lives in Atlanta, Georgia",
        category: "fact",
        importance: "high",
        ...base,
      } as any,
      {
        content: "Born in Hangzhou, China",
        category: "fact",
        importance: "medium",
        ...base,
      } as any,
    ]);

    const results = await memoriesCol
      .find({
        active: true,
        content: { $regex: "atlanta", $options: "i" },
      })
      .toArray();
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("Atlanta");
  });

  // ---------------------------------------------------------------------------
  // Access count update
  // ---------------------------------------------------------------------------

  it("increments access_count and updates last_accessed_at", async () => {
    const now = new Date();
    const result = await memoriesCol.insertOne({
      content: "Tracked memory",
      category: "fact",
      importance: "medium",
      tags: [],
      source: { platform: "test", agent_id: "test" },
      supersedes: null,
      access_count: 0,
      last_accessed_at: null,
      stability: 1.0,
      created_at: now,
      updated_at: now,
      active: true,
    } as any);

    await memoriesCol.updateOne(
      { _id: result.insertedId },
      {
        $inc: { access_count: 1, stability: 0.1 },
        $set: { last_accessed_at: new Date() },
      }
    );

    const updated = await memoriesCol.findOne({ _id: result.insertedId });
    expect(updated!.access_count).toBe(1);
    expect(updated!.stability).toBeCloseTo(1.1, 5);
    expect(updated!.last_accessed_at).not.toBeNull();
  });
});
