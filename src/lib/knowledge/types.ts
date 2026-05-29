// 知识库数据类型定义

// 跨期答案
export interface KnowledgeAnswer {
  id: number;
  knowledge_id: string;
  period: number;
  answer: string;
  source: string | null;
  std_question_period: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

// 知识库主表条目
export interface KnowledgeEntry {
  id: string;
  source_id: string | null;
  std_question: string;
  retrieval_text: string | null;
  category: string | null;
  intent: string | null;
  scene: string | null;
  answer_mode: string | null;
  requires_verification: string | null;
  requires_business_confirm: boolean;
  similar_questions: string[] | null;
  keywords: string[] | null;
  channels: string[] | null;
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
  // 关联的跨期答案（JOIN 查询时填充）
  answers?: KnowledgeAnswer[];
}

// 创建知识条目输入
export interface CreateKnowledgeInput {
  source_id?: string;
  std_question: string;
  retrieval_text?: string;
  category?: string;
  intent?: string;
  scene?: string;
  answer_mode?: string;
  requires_verification?: string;
  requires_business_confirm?: boolean;
  similar_questions?: string[];
  keywords?: string[];
  channels?: string[];
  embedding?: number[];
  answers?: CreateKnowledgeAnswerInput[];
}

// 创建跨期答案输入
export interface CreateKnowledgeAnswerInput {
  period: number;
  answer: string;
  source?: string;
  std_question_period?: string;
  valid_from?: string;
  valid_to?: string;
}

// 更新知识条目输入
export interface UpdateKnowledgeInput {
  source_id?: string;
  std_question?: string;
  retrieval_text?: string;
  category?: string;
  intent?: string;
  scene?: string;
  answer_mode?: string;
  requires_verification?: string;
  requires_business_confirm?: boolean;
  similar_questions?: string[];
  keywords?: string[];
  channels?: string[];
  embedding?: number[];
}

// 查询参数
export interface KnowledgeQueryParams {
  page?: number;
  pageSize?: number;
  category?: string;
  intent?: string;
  keyword?: string;
  period?: number;
}
