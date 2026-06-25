/**
 * R-NS5-retrieval · 叙事感知检索（NS-5）
 * 守卫：切块+关键词、按 hash 复用/重建、关键词召回、未来章不泄漏、世界隔离、按时间重组。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { splitIntoChunks, extractKeywords, rebuildChapterChunks, retrieveChunks } from '../../src/lib/retrieval/retrieval'

const now = Date.now()
async function seedChapters(texts: string[]) {
  const pid = await db.projects.add({ name: 'P', genre: 'x', description: '', targetWordCount: 0, enableMultiWorld: false, createdAt: now, updatedAt: now } as any) as number
  const vol = await db.outlineNodes.add({ projectId: pid, parentId: null, type: 'volume', title: '卷', summary: '', order: 0, createdAt: now, updatedAt: now } as any) as number
  const chaps: number[] = []
  for (let i = 0; i < texts.length; i++) {
    const n = await db.outlineNodes.add({ projectId: pid, parentId: vol, type: 'chapter', title: `第${i + 1}章`, summary: '', order: i, createdAt: now, updatedAt: now } as any) as number
    const c = await db.chapters.add({ projectId: pid, outlineNodeId: n, title: `第${i + 1}章`, content: texts[i], wordCount: 0, status: 'draft', order: i, notes: '', createdAt: now, updatedAt: now } as any) as number
    chaps.push(c)
  }
  return { pid, chaps }
}

describe('NS-5 · retrieval', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(async () => { db.close() })

  it('切块与关键词抽取', () => {
    expect(splitIntoChunks('').length).toBe(0)
    expect(splitIntoChunks('一段\n二段\n三段').length).toBeGreaterThan(0)
    expect(extractKeywords('林飞拿起青铜铃', ['林飞', '苏禾', '青铜铃'])).toEqual(expect.arrayContaining(['林飞', '青铜铃']))
  })

  it('正文未变复用、变了重建', async () => {
    const { pid, chaps } = await seedChapters(['林飞在洛阳。'])
    const ch = await db.chapters.get(chaps[0])
    const r1 = await rebuildChapterChunks({ projectId: pid, chapter: ch!, knownEntities: ['林飞'] })
    expect(r1.rebuilt).toBe(true)
    const r2 = await rebuildChapterChunks({ projectId: pid, chapter: ch!, knownEntities: ['林飞'] })
    expect(r2.rebuilt).toBe(false) // hash 相同复用
    await db.chapters.update(chaps[0], { content: '林飞到了北境。' })
    const ch2 = await db.chapters.get(chaps[0])
    const r3 = await rebuildChapterChunks({ projectId: pid, chapter: ch2!, knownEntities: ['林飞'] })
    expect(r3.rebuilt).toBe(true) // 正文变→重建
  })

  it('关键词召回 + 未来章不泄漏', async () => {
    const { pid, chaps } = await seedChapters([
      '第一章：林飞在洛阳被预言只剩十六年阳寿。',
      '第二章：林飞前往北境。',
      '第三章：林飞抵达轮回沙海。', // 当前章(未来)
    ])
    for (const c of chaps) {
      const ch = await db.chapters.get(c)
      await rebuildChapterChunks({ projectId: pid, chapter: ch!, knownEntities: ['林飞'] })
    }
    // 在写第3章时召回（currentChapter = chaps[2]）
    const got = await retrieveChunks({ projectId: pid, currentChapterId: chaps[2], queryTerms: ['林飞'], topK: 5 })
    const sources = got.map(r => r.chunk.sourceChapterId)
    expect(sources).toContain(chaps[0])
    expect(sources).toContain(chaps[1])
    expect(sources).not.toContain(chaps[2]) // 当前/未来章不召回
  })

  it('世界隔离：别的世界的块不召回', async () => {
    const { pid, chaps } = await seedChapters(['第一章：林飞在洛阳。', '第二章：当前。'])
    const ch0 = await db.chapters.get(chaps[0])
    await rebuildChapterChunks({ projectId: pid, chapter: ch0!, worldGroupId: 99, knownEntities: ['林飞'] })
    const got = await retrieveChunks({ projectId: pid, currentChapterId: chaps[1], worldGroupId: 7, queryTerms: ['林飞'] })
    expect(got.length).toBe(0) // 块在世界99，当前世界7 → 不召回
  })
})
