export interface Memory {
  _id?: string;
  content: string;
  category: MemoryCategory;
  importance: Importance;
  tags: string[];
  source: MemorySource;
  supersedes: string | null;
  access_count: number;
  last_accessed_at: Date | null;
  stability: number;
  created_at: Date;
  updated_at: Date;
  active: boolean;
  embedding?: number[];
}

export type MemoryCategory =
  | "preference"
  | "fact"
  | "event"
  | "person"
  | "correction"
  | "instruction";

export type Importance = "low" | "medium" | "high";

export interface MemorySource {
  platform: string;
  agent_id: string;
  session_hint?: string;
}

export interface RetrieveParams {
  query: string;
  category?: MemoryCategory | "all";
  limit?: number;
}

export interface SaveParams {
  content: string;
  category: MemoryCategory;
  importance: Importance;
  tags?: string[];
  source_platform?: string;
  source_agent_id?: string;
}

export interface DeleteParams {
  memory_id: string;
}

export interface ProfileDocument {
  _id: string;
  summary: string;
  last_updated: Date;
  version: number;
}
