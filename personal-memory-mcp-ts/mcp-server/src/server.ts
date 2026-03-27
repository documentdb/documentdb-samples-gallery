import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  retrieveMemory,
  saveMemory,
  deleteMemory,
  getProfile,
} from "./memory.js";
import { logger } from "./logger.js";

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Only return the message, never the stack trace
    if (error.message.includes("ECONNREFUSED") || error.message.includes("ETIMEDOUT")) {
      return "Database temporarily unavailable. Please try again.";
    }
    if (error.message.includes("ObjectId")) {
      return "Invalid memory ID format.";
    }
    return error.message;
  }
  return "An unexpected error occurred.";
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "personal-memory",
    version: "0.1.0",
  });

  // Tool: retrieve_memory
  server.tool(
    "retrieve_memory",
    `Search the user's personal memory for relevant context.
Call this at the START of conversations and when the user asks about
personal information, preferences, past events, or people they know.
Returns memories ranked by relevance, recency, and importance.`,
    {
      query: z
        .string()
        .describe(
          "Natural language query describing what context you need"
        ),
      category: z
        .enum([
          "preference",
          "fact",
          "event",
          "person",
          "correction",
          "instruction",
          "all",
        ])
        .default("all")
        .describe("Optional filter by memory category"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(5)
        .describe("Max memories to return"),
    },
    async (params) => {
      try {
        const memories = await retrieveMemory({
          query: params.query,
          category: params.category as any,
          limit: params.limit,
        });

        if (memories.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No relevant memories found.",
              },
            ],
          };
        }

        const formatted = memories
          .map(
            (m, i) =>
              `${i + 1}. [${m.category}/${m.importance}] ${m.content}\n   Tags: ${m.tags.join(", ") || "none"} | Source: ${m.source.platform} | ID: ${m._id}`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${memories.length} relevant memories:\n\n${formatted}`,
            },
          ],
        };
      } catch (error) {
        logger.error({ err: error }, "retrieve_memory failed");
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving memories: ${safeErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: save_memory
  server.tool(
    "save_memory",
    `Save a durable fact about the user to persistent memory.
Call this when the user shares LASTING personal information:
- Personal facts (name, location, family, job)
- Preferences (likes, dislikes, habits, communication style)
- Important events (milestones, plans, dates)
- People and relationships
- Corrections to previously known facts
- Instructions for how to behave ("always be brief", "prefer Python")

Do NOT save:
- Transient tasks (debug this, write that code)
- Opinions about external topics
- Greetings or chit-chat
- Anything the user asks you NOT to remember`,
    {
      content: z
        .string()
        .describe(
          "The fact to remember, written as a clear statement"
        ),
      category: z
        .enum([
          "preference",
          "fact",
          "event",
          "person",
          "correction",
          "instruction",
        ])
        .describe("Category of the memory"),
      importance: z
        .enum(["low", "medium", "high"])
        .describe(
          "How important: high=core identity/family, medium=preferences, low=minor details"
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe(
          "Keywords for this memory (e.g., ['family', 'daughter', 'daycare'])"
        ),
      source_platform: z
        .string()
        .optional()
        .describe(
          "Which AI platform is saving this (chatgpt, claude, copilot, gemini)"
        ),
      source_agent_id: z
        .string()
        .optional()
        .describe("More specific agent identifier"),
    },
    async (params) => {
      try {
        const result = await saveMemory({
          content: params.content,
          category: params.category,
          importance: params.importance,
          tags: params.tags,
          source_platform: params.source_platform,
          source_agent_id: params.source_agent_id,
        });
        return {
          content: [{ type: "text" as const, text: result }],
        };
      } catch (error) {
        logger.error({ err: error }, "save_memory failed");
        return {
          content: [
            {
              type: "text" as const,
              text: `Error saving memory: ${safeErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: get_profile
  server.tool(
    "get_profile",
    `Get the user's aggregated profile summary.
Call this at the start of a new conversation to understand who
the user is. Returns a concise summary of key personal facts.`,
    {},
    async () => {
      try {
        const profile = await getProfile();
        return {
          content: [{ type: "text" as const, text: profile }],
        };
      } catch (error) {
        logger.error({ err: error }, "get_profile failed");
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting profile: ${safeErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: delete_memory
  server.tool(
    "delete_memory",
    `Delete a specific memory when the user asks to forget something.
Call this when the user explicitly says "forget that" or "don't remember X".`,
    {
      memory_id: z
        .string()
        .describe(
          "ID of the memory to delete (from retrieve_memory results)"
        ),
    },
    async (params) => {
      try {
        const result = await deleteMemory({
          memory_id: params.memory_id,
        });
        return {
          content: [{ type: "text" as const, text: result }],
        };
      } catch (error) {
        logger.error({ err: error }, "delete_memory failed");
        return {
          content: [
            {
              type: "text" as const,
              text: `Error deleting memory: ${safeErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Resource: user profile
  server.resource("memory://profile", "memory://profile", async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "text/plain",
        text: await getProfile(),
      },
    ],
  }));

  return server;
}
