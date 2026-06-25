/**
 * NS-5 · 叙事感知混合检索（关键词通道 + 可选 embedding 通道）。
 *
 * 设计 §22.8 NS-5。本模块负责：
 * - 把章节正文切块、抽实体关键词、写入 retrievalChunks（可重建缓存，按 sourceTextHash 失效重建）；
 * - 按"当前章需要"召回历史块：关键词重叠打分（纯浏览器，无需 embedding）+ 可选 embedding 余弦；
 *   硬过滤：未来章不泄漏（规范章序）、世界隔离、按时间重组；去重、邻接保留、top-K。
 * - embedding 不可用时只走关键词通道（优雅降级）。
 */
import { db } from '../db/schema'
import type { RetrievalChunk } from '../types/retrieval-chunk'
import { cosineSimilarity } from '../types/retrieval-chunk'
import type { Chapter } from '../types'
import { normalizeChapterText, hashChapterText } from '../ai/chapter-memory/text-normalization'
import { resolveCanonicalChapterSequence } from '../ai/chapter-memory/canonical-chapter-sequence'

const CHUNK_SIZE = 400

/** 把正文切成定长块（按段落边界尽量不切断）。 */
export function splitIntoChunks(text: string, size = CHUNK_SIZE): string[] {
  const clean = text.trim()
  if (!clean) return []
  const paras = clean.split(/\n+/).map(p => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if ((buf + p).length > size && buf) { chunks.push(buf); buf = '' }
    buf = buf ? `${buf}\n${p}` : p
    while (buf.length > size * 1.6) { chunks.push(buf.slice(0, size)); buf = buf.slice(size) }
  }
  if (buf) chunks.push(buf)
  return chunks
}

/** 抽取出现在块里的已知实体（角色/词条名）作为关键词。 */
export function extractKeywords(text: string, knownEntities: string[]): string[] {
  const found = new Set<string>()
  for (const e of knownEntities) {
    if (e && e.length >= 2 && text.includes(e)) found.add(e)
  }
  return [...found]
}

/**
 * 重建某章的检索块（删旧块 + 切块 + 抽关键词 + 写入）。正文未变（hash 相同）则跳过。
 * embedding 字段留空——由可选 embedding 通道异步回填，不阻塞。
 */
export async function rebuildChapterChunks(args: {
  projectId: number
  chapter: Chapter
  worldGroupId?: number | null
  knownEntities: string[]
}): Promise<{ rebuilt: boolean; count: number }> {
  const { projectId, chapter, worldGroupId, knownEntities } = args
  if (chapter.id == null) return { rebuilt: false, count: 0 }
  const normalized = normalizeChapterText(chapter.content || '')
  const hash = await hashChapterText(chapter.content || '')

  const existing = await db.retrievalChunks.where('sourceChapterId').equals(chapter.id).toArray()
  if (existing.length && existing[0].sourceTextHash === hash) {
    return { rebuilt: false, count: existing.length } // 正文未变，复用
  }
  // 正文变了 / 首次：清旧块重建
  if (existing.length) await db.retrievalChunks.bulkDelete(existing.map(c => c.id!).filter(Boolean))
  if (!normalized.trim()) return { rebuilt: true, count: 0 }

  const pieces = splitIntoChunks(normalized)
  const now = Date.now()
  const rows: RetrievalChunk[] = pieces.map((text, i) => ({
    projectId,
    worldGroupId: worldGroupId ?? null,
    sourceChapterId: chapter.id!,
    chunkIndex: i,
    text,
    keywords: extractKeywords(text, knownEntities),
    embedding: null,
    embeddingModel: null,
    sourceTextHash: hash,
    createdAt: now,
  }))
  if (rows.length) await db.retrievalChunks.bulkAdd(rows)
  return { rebuilt: true, count: rows.length }
}

export interface RetrievedChunk {
  chunk: RetrievalChunk
  score: number
}

/**
 * 召回与查询相关的历史块。
 * - queryTerms：当前章的实体/关键词（角色名、章纲要点）；
 * - queryEmbedding：可选，提供则叠加余弦分（混合检索）；
 * - 硬过滤：只取规范章序 < 当前章的块（不泄漏未来）、当前世界（∪ null）。
 */
export async function retrieveChunks(args: {
  projectId: number
  currentChapterId: number
  worldGroupId?: number | null
  queryTerms: string[]
  queryEmbedding?: number[] | null
  topK?: number
}): Promise<RetrievedChunk[]> {
  const { projectId, currentChapterId, worldGroupId, queryTerms, queryEmbedding, topK = 6 } = args
  const [chunks, outlineNodes, chapters] = await Promise.all([
    db.retrievalChunks.where('projectId').equals(projectId).toArray(),
    db.outlineNodes.where('projectId').equals(projectId).toArray(),
    db.chapters.where('projectId').equals(projectId).toArray(),
  ])
  if (!chunks.length) return []

  const { sequence } = resolveCanonicalChapterSequence(outlineNodes, chapters)
  const orderOf = new Map<number, number>()
  sequence.forEach((entry, i) => { if (entry.chapter.id != null) orderOf.set(entry.chapter.id, i) })
  const currentOrder = orderOf.get(currentChapterId)
  if (currentOrder == null) return []

  const terms = queryTerms.filter(t => t && t.length >= 2)
  const scored: RetrievedChunk[] = []
  for (const chunk of chunks) {
    const chunkOrder = orderOf.get(chunk.sourceChapterId)
    if (chunkOrder == null || chunkOrder >= currentOrder) continue          // 未来/当前章不召回
    if (chunk.worldGroupId != null && chunk.worldGroupId !== (worldGroupId ?? null)) continue // 世界隔离
    // 关键词重叠分（命中实体 + 命中文本词）
    let kw = 0
    for (const t of terms) {
      if (chunk.keywords.includes(t)) kw += 2
      else if (chunk.text.includes(t)) kw += 1
    }
    // 可选 embedding 余弦
    const sem = queryEmbedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0
    const score = kw + sem * 3
    if (score > 0) scored.push({ chunk, score })
  }
  scored.sort((a, b) => b.score - a.score || b.chunk.sourceChapterId - a.chunk.sourceChapterId)
  // 取 top-K 后按时间(章序→块序)重组，便于阅读
  const top = scored.slice(0, topK)
  top.sort((a, b) =>
    (orderOf.get(a.chunk.sourceChapterId)! - orderOf.get(b.chunk.sourceChapterId)!) ||
    (a.chunk.chunkIndex - b.chunk.chunkIndex))
  return top
}
