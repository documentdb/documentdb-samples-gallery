import { getMemoriesCollection, getProfileCollection } from "./db.js";
import { logger } from "./logger.js";
import { getEmbedding } from "./embeddings.js";
import type {
  Memory,
  RetrieveParams,
  SaveParams,
  DeleteParams,
} from "./types.js";
import { ObjectId } from "mongodb";

const IMPORTANCE_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Compute a decay-aware relevance score.
 * Memories that are accessed more often and more recently rank higher.
 */
export function decayScore(memory: Memory, now?: number): number {
  const currentTime = now ?? Date.now();
  const lastAccess = memory.last_accessed_at
    ? new Date(memory.last_accessed_at).getTime()
    : new Date(memory.created_at).getTime();
  const daysSinceAccess = (currentTime - lastAccess) / (1000 * 60 * 60 * 24);
  const retention = Math.exp(-daysSinceAccess / (memory.stability * 30));
  const importanceBoost = IMPORTANCE_WEIGHT[memory.importance] || 1;
  return retention * importanceBoost;
}

export async function retrieveMemory(
  params: RetrieveParams
): Promise<Memory[]> {
  const col = getMemoriesCollection();
  const { query, category = "all", limit = 5 } = params;
  const safeLimit = Math.min(Math.max(limit, 1), 20);

  // Extract keywords from query for tag and content matching
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  // Build base filter
  const filter: Record<string, unknown> = { active: true };
  if (category !== "all") {
    filter.category = category;
  }

  // Strategy 0: Vector search via DocumentDB cosmosSearch (semantic similarity)
  let memories: Memory[] = [];
  if (query.trim()) {
    const queryEmbedding = await getEmbedding(query);
    if (queryEmbedding) {
      try {
        memories = (await col
          .aggregate([
            {
              $search: {
                cosmosSearch: {
                  vector: queryEmbedding,
                  path: "embedding",
                  k: safeLimit * 3,
                },
                returnStoredSource: true,
              },
            },
            { $addFields: { similarityScore: { $meta: "searchScore" } } },
            { $match: filter },
            { $project: { embedding: 0 } },
            { $limit: safeLimit * 3 },
          ])
          .toArray()) as unknown as Memory[];
        logger.debug(
          { count: memories.length },
          "Vector search returned results"
        );
      } catch (e) {
        logger.debug({ err: e }, "Vector search failed, falling back");
      }
    }
  }

  // Strategy 1: Try $text search (must be top-level, can't be inside $or)
  if (query.trim()) {
    try {
      const textResults = await col
        .find({ ...filter, $text: { $search: query } })
        .limit(safeLimit * 3)
        .toArray();
      const seenIds = new Set(memories.map((m) => String(m._id)));
      for (const m of textResults) {
        if (!seenIds.has(String(m._id))) {
          memories.push(m);
          seenIds.add(String(m._id));
        }
      }
    } catch (e) {
      logger.debug({ err: e }, "Text search failed, falling back");
    }
  }

  // Strategy 2: Tag-based search (union with text results)
  if (keywords.length > 0) {
    try {
      const tagResults = await col
        .find({ ...filter, tags: { $in: keywords } })
        .limit(safeLimit * 3)
        .toArray();
      // Merge, avoiding duplicates
      const seenIds = new Set(memories.map((m) => String(m._id)));
      for (const m of tagResults) {
        if (!seenIds.has(String(m._id))) {
          memories.push(m);
          seenIds.add(String(m._id));
        }
      }
    } catch (e) {
      logger.debug({ err: e }, "Tag search failed, falling back");
    }
  }

  // Strategy 3: Regex on each keyword in content (broader match)
  if (memories.length < safeLimit * 2 && keywords.length > 0) {
    try {
      const regexClauses = keywords.map((kw) => ({
        content: {
          $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        },
      }));
      const regexResults = await col
        .find({ ...filter, $or: regexClauses })
        .limit(safeLimit * 3)
        .toArray();
      const seenIds = new Set(memories.map((m) => String(m._id)));
      for (const m of regexResults) {
        if (!seenIds.has(String(m._id))) {
          memories.push(m);
          seenIds.add(String(m._id));
        }
      }
    } catch (e) {
      logger.debug({ err: e }, "Regex search failed");
    }
  }

  // Fallback: if still nothing, return most recent memories
  if (memories.length === 0) {
    memories = await col
      .find(filter)
      .sort({ created_at: -1 })
      .limit(safeLimit * 3)
      .toArray();
  }

  // Re-rank by decay-aware relevance
  memories.sort((a, b) => decayScore(b) - decayScore(a));
  const results = memories.slice(0, safeLimit);

  // Update access stats for returned memories
  if (results.length > 0) {
    const ids = results
      .map((m) => m._id)
      .filter((id): id is string => id !== undefined);
    if (ids.length > 0) {
      await col.updateMany(
        { _id: { $in: ids.map((id) => new ObjectId(id)) } } as any,
        {
          $inc: { access_count: 1, stability: 0.1 },
          $set: { last_accessed_at: new Date() },
        }
      );
    }
  }

  return results;
}

export async function saveMemory(params: SaveParams): Promise<string> {
  const col = getMemoriesCollection();
  const {
    content,
    category,
    importance,
    tags = [],
    source_platform = "unknown",
    source_agent_id = "unknown",
  } = params;

  // Dedup check: look for very similar existing memories
  let supersededId: string | null = null;
  const existing = await col
    .find({
      active: true,
      content: {
        $regex: content
          .substring(0, 50)
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      },
    })
    .limit(5)
    .toArray();

  for (const mem of existing) {
    const similarity = computeSimpleSimilarity(content, mem.content);
    if (similarity > 0.85) {
      // Very similar — check if it's a correction/update
      if (category === "correction") {
        // Supersede the old memory
        await col.updateOne(
          { _id: mem._id },
          { $set: { active: false, updated_at: new Date() } }
        );
        supersededId = String(mem._id);
        break;
      }
      // Otherwise skip — already known
      return `Memory already exists (similar to ${mem._id}): "${mem.content.substring(0, 60)}..."`;
    }
  }

  const now = new Date();
  const embedding = await getEmbedding(content);
  const memory: Memory = {
    content,
    category,
    importance,
    tags: tags.map((t) => t.toLowerCase()),
    source: {
      platform: source_platform,
      agent_id: source_agent_id,
    },
    supersedes: supersededId,
    access_count: 0,
    last_accessed_at: null,
    stability: 1.0,
    created_at: now,
    updated_at: now,
    active: true,
    ...(embedding ? { embedding } : {}),
  };

  const result = await col.insertOne(memory as any);
  return `Saved memory ${result.insertedId}: "${content.substring(0, 60)}..."`;
}

export async function deleteMemory(params: DeleteParams): Promise<string> {
  const col = getMemoriesCollection();
  try {
    const result = await col.updateOne(
      { _id: new ObjectId(params.memory_id) } as any,
      { $set: { active: false, updated_at: new Date() } }
    );
    if (result.modifiedCount === 0) {
      return `Memory ${params.memory_id} not found or already deleted.`;
    }
    return `Memory ${params.memory_id} deleted.`;
  } catch {
    return `Invalid memory ID: ${params.memory_id}`;
  }
}

export async function getProfile(): Promise<string> {
  const profileCol = getProfileCollection();
  const profile = await profileCol.findOne({ _id: "default" } as any);
  if (profile) {
    return profile.summary;
  }

  // Generate profile from top memories if no profile exists yet
  const col = getMemoriesCollection();
  const topMemories = await col
    .find({ active: true })
    .sort({ created_at: -1 })
    .limit(50)
    .toArray();

  if (topMemories.length === 0) {
    return "No memories stored yet. Start a conversation and save some facts about yourself!";
  }

  // Sort by importance (high > medium > low) since string sort is lexicographic
  const importanceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  topMemories.sort(
    (a, b) => (importanceOrder[a.importance] ?? 3) - (importanceOrder[b.importance] ?? 3)
  );

  const summary = topMemories
    .map((m) => `- [${m.category}/${m.importance}] ${m.content}`)
    .join("\n");

  return `User Profile (${topMemories.length} memories):\n${summary}`;
}

/**
 * Simple string similarity (Jaccard on word sets).
 * Good enough for deduplication without embeddings.
 */
export function computeSimpleSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}
