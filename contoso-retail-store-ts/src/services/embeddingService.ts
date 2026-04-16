import { config } from "../config/index.js";

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.ollamaModel, input: text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama embedding request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { embeddings: number[][] };
  const embedding = data.embeddings[0];
  if (!embedding || embedding.length !== config.embeddingDimensions) {
    throw new Error(
      `Expected ${config.embeddingDimensions}-dim embedding, got ${embedding?.length ?? 0}`
    );
  }
  return embedding;
}
