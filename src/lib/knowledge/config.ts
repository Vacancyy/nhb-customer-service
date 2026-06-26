// 知识库搜索配置

// 当前服务期数（六期宁惠保）
export const CURRENT_PERIOD = 6;

// 默认返回条数
export const DEFAULT_TOPK = parseInt(process.env.KNOWLEDGE_SEARCH_TOPK || '5');

// 最小相似度阈值（0-1），低于此值的结果将被过滤
export const MIN_SIMILARITY = parseFloat(process.env.KNOWLEDGE_SEARCH_MIN_SIMILARITY || '0.3');

// TopK 最大限制
export const MAX_TOPK = 10;

// 向量维度
export const EMBEDDING_DIMENSION = 1024;

// 获取有效的 TopK 值
export function getValidTopK(topK?: number): number {
  return Math.min(Math.max(topK || DEFAULT_TOPK, 1), MAX_TOPK);
}