// 知识库数据类型定义

export interface KnowledgeEntry {
  id: string;
  topic: string;
  question: string;
  embedding: number[] | null;
  structured_data: Record<string, any>;
  category: string | null;
  updated_at: Date;
}

export interface CreateKnowledgeInput {
  topic: string;
  question: string;
  embedding?: number[];
  structured_data: Record<string, any>;
  category?: string;
}

export interface UpdateKnowledgeInput {
  topic?: string;
  question?: string;
  embedding?: number[];
  structured_data?: Record<string, any>;
  category?: string;
}

export interface KnowledgeQueryParams {
  page?: number;
  pageSize?: number;
  category?: string;
  topic?: string;
  keyword?: string;
}