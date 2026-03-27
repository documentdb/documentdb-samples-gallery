import { logger } from "./logger.js";

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_EMBEDDING_MODEL =
  process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text";
const EMBEDDING_DIMENSIONS = parseInt(
  process.env.EMBEDDING_DIMENSIONS || "768",
  10
);

let ollamaAvailable: boolean | null = null;

/**
 * Check whether Ollama is reachable. Result is cached after first call.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  if (ollamaAvailable !== null) return ollamaAvailable;

  try {
    const res = await fetch(OLLAMA_BASE_URL, {
      signal: AbortSignal.timeout(3000),
    });
    ollamaAvailable = res.ok;
  } catch {
    ollamaAvailable = false;
  }

  if (ollamaAvailable) {
    logger.info(
      { model: OLLAMA_EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS },
      "Ollama available — vector search enabled"
    );
  } else {
    logger.info(
      "Ollama not available — vector search disabled (text/tag/regex still active)"
    );
  }

  return ollamaAvailable;
}

/**
 * Generate an embedding vector for the given text using Ollama.
 * Returns null if Ollama is unavailable or the request fails.
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!(await isOllamaAvailable())) return null;

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_EMBEDDING_MODEL, prompt: text }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "Ollama embedding request failed");
      return null;
    }

    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ?? null;
  } catch (err) {
    logger.debug({ err }, "Ollama embedding error");
    return null;
  }
}

export function getEmbeddingDimensions(): number {
  return EMBEDDING_DIMENSIONS;
}
