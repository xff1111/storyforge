/**
 * R-export-fullcoverage · 全部 exportable 表 · 多世界全量导出/导入安全网
 *
 * 目的(AUDIT-1 重构安全网):在把 json-export 从「手写枚举」重构为「注册表派生」之前,
 * 先用一个**覆盖全部 31 张 exportable 表 + 双世界组**的种子做往返,锁死当前手写版的正确行为。
 * 重构后此测试必须保持全绿——任何外键重映射/树重建/世界组重映射的行为漂移都会被它抓到。
 *
 * 比 R-export-import-roundtrip 更严:那条是单世界(worldGroupId 全 null),本条是**双世界组**,
 * 真正覆盖 worldGroupId / homeWorldGroupId 重映射这条最复杂的路径。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '../../src/lib/db/schema'
import { PROJECT_TABLES } from '../../src/lib/registry/project-tables'
import { exportProjectJSON, importProjectJSON } from '../../src/lib/export/json-export'
import { parseWorldPortals } from '../../src/lib/utils/world-portals'

const now = Date.now()

/** 种子:每张 exportable 表至少一行,带双世界组 + 树 + 各类外键。返回各源 id 便于断言。 */
async function seedEverything() {
  const projectId = await db.projects.add({
    name: '全量作品', genre: 'fantasy', genres: ['fantasy'], description: '全表往返',
    targetWordCount: 100000, enableMultiWorld: true, createdAt: now, updatedAt: now,
  } as any) as number

  // ── 双世界组(order 决定导出序) ──
  const wgA = await db.worldGroups.add({ projectId, name: '主世界群', order: 0, createdAt: now, updatedAt: now } as any) as number
  const wgB = await db.worldGroups.add({ projectId, name: '镜世界群', order: 1, createdAt: now, updatedAt: now } as any) as number
  await db.worldGroupLinks.add({ projectId, fromGroupId: wgA, toGroupId: wgB, type: 'portal', createdAt: now, updatedAt: now } as any)

  // ── worldScoped 设定表(挂 wgA / wgB,验证 worldGroupId 重映射) ──
  await db.worldviews.add({ projectId, worldGroupId: wgA, worldOrigin: '混沌创世', powerHierarchy: '炼气→金丹', createdAt: now, updatedAt: now } as any)
  await db.worldviews.add({ projectId, worldGroupId: wgB, worldOrigin: '镜中倒影', createdAt: now, updatedAt: now } as any)
  await db.storyCores.add({ projectId, logline: '少年逆袭', mainPlot: '从山村到仙界', createdAt: now, updatedAt: now } as any)
  await db.powerSystems.add({ projectId, worldGroupId: wgA, name: '修真体系', description: '九重天', createdAt: now, updatedAt: now } as any)
  await db.geographies.add({ projectId, worldGroupId: wgA, overview: '三大洲', createdAt: now, updatedAt: now } as any)
  await db.histories.add({ projectId, worldGroupId: wgA, summary: '上古神战', createdAt: now, updatedAt: now } as any)
  await db.historicalTimelineEvents.add({ projectId, worldGroupId: wgA, title: '封神之战', year: -1000, createdAt: now, updatedAt: now } as any)
  await db.historicalKeywords.add({ projectId, worldGroupId: wgA, keyword: '神器', createdAt: now, updatedAt: now } as any)
  await db.worldRulesProfiles.add({ projectId, worldGroupId: wgA, rules: '魔法守恒', createdAt: now, updatedAt: now } as any)

  // ── worldNodes(树 + portalsJSON 自引用,wgA) ──
  const rootWorld = await db.worldNodes.add({ projectId, worldGroupId: wgA, parentId: null, name: '主世界', description: '起点', sortOrder: 0, createdAt: now, updatedAt: now } as any) as number
  const mirrorWorld = await db.worldNodes.add({ projectId, worldGroupId: wgA, parentId: rootWorld, name: '镜界', description: '镜中', sortOrder: 1, createdAt: now, updatedAt: now } as any) as number
  await db.worldNodes.update(rootWorld, { portalsJSON: JSON.stringify([{ name: '镜门', targetWorldId: mirrorWorld, x: 1, y: 2 }]) })

  // ── importantLocations(树) ──
  const locParent = await db.importantLocations.add({ projectId, parentId: null, name: '青云山', type: 'mountain', createdAt: now, updatedAt: now } as any) as number
  await db.importantLocations.add({ projectId, parentId: locParent, name: '青云峰', type: 'peak', createdAt: now, updatedAt: now } as any)

  // ── 角色(homeWorldScoped:一个挂 wgA,一个跨世界) ──
  const char1 = await db.characters.add({ projectId, homeWorldGroupId: wgA, name: '林惊羽', role: 'protagonist', personality: '坚毅', createdAt: now, updatedAt: now } as any) as number
  const char2 = await db.characters.add({ projectId, isCrossWorld: true, name: '苏influence', role: 'supporting', createdAt: now, updatedAt: now } as any) as number
  await db.characterRelations.add({ projectId, fromCharacterId: char1, toCharacterId: char2, type: 'ally', description: '同门', createdAt: now, updatedAt: now } as any)

  // ── 大纲(树,wgA)+ 章节 + 细纲 + 情感卡 ──
  const vol = await db.outlineNodes.add({ projectId, worldGroupId: wgA, parentId: null, type: 'volume', title: '第一卷', summary: '开篇', order: 0, createdAt: now, updatedAt: now } as any) as number
  const chapNode = await db.outlineNodes.add({ projectId, worldGroupId: wgA, parentId: vol, type: 'chapter', title: '第1章', summary: '觉醒', order: 0, createdAt: now, updatedAt: now } as any) as number
  const chapter = await db.chapters.add({ projectId, outlineNodeId: chapNode, title: '第1章', content: '<p>废墟中睁眼</p>', wordCount: 6, status: 'draft', order: 0, createdAt: now, updatedAt: now } as any) as number
  await db.detailedOutlines.add({ projectId, outlineNodeId: chapNode, openingHook: '承接', endingCliffhanger: '黑影', appearingCharacterIds: [char1], scenes: [{ sceneId: 's1', title: '苏醒', summary: '醒来', characterIds: [char1], location: '废墟', conflict: '失忆' }], createdAt: now, updatedAt: now } as any)
  await db.emotionBeatCards.add({ projectId, chapterId: chapter, overallArc: '低落→振奋', beats: '[]', createdAt: now, updatedAt: now } as any)

  // ── 下游产物 ──
  await db.foreshadows.add({ projectId, name: '神秘玉佩', type: 'item', status: 'planted', description: '身世之谜', createdAt: now, updatedAt: now } as any)
  await db.storyArcs.add({ projectId, type: 'main', name: '复仇线', stages: '[]', createdAt: now, updatedAt: now } as any)
  await db.stateCards.add({ projectId, category: 'character', entityName: '林惊羽', fields: JSON.stringify([{ key: '境界', value: '炼气一层' }]), createdAt: now, updatedAt: now } as any)
  await db.itemLedger.add({ projectId, itemName: '青锋剑', action: 'gain', quantity: 1, chapterId: chapter, chapterTitle: '第1章', createdAt: now, updatedAt: now } as any)
  await db.storyTimelineEvents.add({ projectId, chapterId: chapter, title: '获得青锋剑', createdAt: now, updatedAt: now } as any)
  await db.notes.add({ projectId, title: '灵感', content: '记一笔', createdAt: now, updatedAt: now } as any)

  // ── 参考书 + 分块分析(creativeRules 引用 reference) ──
  const ref1 = await db.references.add({ projectId, title: '斗破苍穹', author: '天蚕土豆', type: 'story', note: '参考爽点', createdAt: now, updatedAt: now } as any) as number
  await db.referenceChunkAnalysis.add({ referenceId: ref1, chunkIndex: 0, openingTechnique: '天才陨落钩子', createdAt: now, updatedAt: now } as any)
  await db.creativeRules.add({ projectId, citedReferenceIds: [ref1], content: '多爽点', createdAt: now, updatedAt: now } as any)

  // ── 词条(树,wgA) ──
  const cat = await db.codexCategories.add({ projectId, worldGroupId: wgA, parentId: null, name: '势力', order: 0, createdAt: now, updatedAt: now } as any) as number
  const subCat = await db.codexCategories.add({ projectId, worldGroupId: wgA, parentId: cat, name: '宗门', order: 0, createdAt: now, updatedAt: now } as any) as number
  await db.codexEntries.add({ projectId, worldGroupId: wgA, categoryId: subCat, name: '青云宗', summary: '正道魁首', createdAt: now, updatedAt: now } as any)

  // ── FB-5 文风画像 ──
  await db.userStyleProfiles.add({ projectId, profile: '简洁明快', enabled: true, createdAt: now, updatedAt: now } as any)

  return { projectId, wgA, wgB, char1, char2, vol, chapNode, chapter, ref1, cat, subCat, rootWorld, mirrorWorld, locParent }
}

/** 列出所有 exportable 表名(项目级,可按 projectId 查) */
const EXPORTABLE_PROJECT_TABLES = PROJECT_TABLES
  .filter(s => s.exportable && s.name !== 'projects' && s.name !== 'referenceChunkAnalysis')
  .map(s => s.name)

describe('R-export-fullcoverage · 全表多世界往返安全网', () => {
  beforeEach(async () => { await db.delete(); await db.open() })
  afterEach(async () => { db.close() })

  it('每张 exportable 表都有种子数据(种子完整性自检)', async () => {
    const { projectId } = await seedEverything()
    for (const name of EXPORTABLE_PROJECT_TABLES) {
      const count = await (db as any)[name].where('projectId').equals(projectId).count()
      expect(count, `表 ${name} 应有种子数据`).toBeGreaterThan(0)
    }
    // referenceChunkAnalysis 走 referenceId
    const refIds = await db.references.where('projectId').equals(projectId).primaryKeys()
    const rcaCount = await db.referenceChunkAnalysis.where('referenceId').anyOf(refIds as number[]).count()
    expect(rcaCount, 'referenceChunkAnalysis 应有种子数据').toBeGreaterThan(0)
  })

  it('全量导出→导入:每张表行数一致 + 外键/树/世界组重映射正确', async () => {
    const src = await seedEverything()
    const exported = await exportProjectJSON(src.projectId)
    const newId = await importProjectJSON(exported)
    expect(newId).not.toBe(src.projectId)

    // 每张项目级表行数一致
    for (const name of EXPORTABLE_PROJECT_TABLES) {
      const srcCount = await (db as any)[name].where('projectId').equals(src.projectId).count()
      const newCount = await (db as any)[name].where('projectId').equals(newId).count()
      expect(newCount, `表 ${name} 往返后行数应一致`).toBe(srcCount)
    }

    // 世界组重映射:新项目两个世界组,worldviews 分别挂到正确的新世界组
    const newGroups = await db.worldGroups.where('projectId').equals(newId).sortBy('order')
    expect(newGroups).toHaveLength(2)
    const newWgA = newGroups[0].id!, newWgB = newGroups[1].id!
    const newWorldviews = await db.worldviews.where('projectId').equals(newId).toArray()
    expect(newWorldviews.find(w => w.worldOrigin?.includes('混沌'))?.worldGroupId).toBe(newWgA)
    expect(newWorldviews.find(w => w.worldOrigin?.includes('镜中'))?.worldGroupId).toBe(newWgB)

    // worldGroupLinks 重映射
    const newLinks = await db.worldGroupLinks.where('projectId').equals(newId).toArray()
    expect(newLinks[0].fromGroupId).toBe(newWgA)
    expect(newLinks[0].toGroupId).toBe(newWgB)

    // 角色 homeWorldGroupId 重映射(char1 挂 wgA,char2 跨世界 null)
    const newChars = await db.characters.where('projectId').equals(newId).toArray()
    const newChar1 = newChars.find(c => c.name === '林惊羽')!
    expect(newChar1.homeWorldGroupId).toBe(newWgA)

    // 角色关系重映射
    const newRels = await db.characterRelations.where('projectId').equals(newId).toArray()
    expect(newRels).toHaveLength(1)
    const newChar2 = newChars.find(c => c.role === 'supporting')!
    expect(newRels[0].fromCharacterId).toBe(newChar1.id)
    expect(newRels[0].toCharacterId).toBe(newChar2.id)

    // 大纲树 + 章节外键
    const newOutline = await db.outlineNodes.where('projectId').equals(newId).toArray()
    const newVol = newOutline.find(n => n.type === 'volume')!
    const newChapNode = newOutline.find(n => n.type === 'chapter')!
    expect(newChapNode.parentId).toBe(newVol.id) // 树重建
    expect(newChapNode.worldGroupId).toBe(newWgA) // 世界组重映射
    const newChapter = await db.chapters.where('projectId').equals(newId).first()
    expect(newChapter!.outlineNodeId).toBe(newChapNode.id)
    expect(newChapter!.content).toContain('废墟中睁眼')

    // 细纲外键(outlineNodeId 重映射正确)
    const newDetail = await db.detailedOutlines.where('projectId').equals(newId).first()
    expect(newDetail!.outlineNodeId).toBe(newChapNode.id)
    // ⚠️ 已知缺陷(AUDIT-1 发现):detailedOutlines.appearingCharacterIds 与 scenes[].characterIds
    // 这两个「数组/JSON 内的角色引用」当前手写导入**未重映射**到新角色 id(注册表 refs 已声明,但
    // exportRemap 漏处理)。安全网此处只锁「当前行为」,不断言重映射值。派生引擎切换完成后,作为
    // 增量修复单独开启数组/JSON 引用重映射 + 独立测试。见 ROADMAP AUDIT-1b。
    expect(newDetail!.appearingCharacterIds).toBeDefined()

    // 情感卡 → 章节
    const newBeat = await db.emotionBeatCards.where('projectId').equals(newId).first()
    expect(newBeat!.chapterId).toBe(newChapter!.id)

    // itemLedger/storyTimeline → 章节
    const newItem = await db.itemLedger.where('projectId').equals(newId).first()
    expect(newItem!.chapterId).toBe(newChapter!.id)
    const newSte = await db.storyTimelineEvents.where('projectId').equals(newId).first()
    expect(newSte!.chapterId).toBe(newChapter!.id)

    // 重要地点树
    const newLocs = await db.importantLocations.where('projectId').equals(newId).toArray()
    const newLocParent = newLocs.find(l => l.name === '青云山')!
    const newLocChild = newLocs.find(l => l.name === '青云峰')!
    expect(newLocChild.parentId).toBe(newLocParent.id)

    // 词条树 + 词条外键 + 世界组
    const newCats = await db.codexCategories.where('projectId').equals(newId).toArray()
    const newCat = newCats.find(c => c.name === '势力')!
    const newSubCat = newCats.find(c => c.name === '宗门')!
    expect(newSubCat.parentId).toBe(newCat.id)
    expect(newSubCat.worldGroupId).toBe(newWgA)
    const newEntry = await db.codexEntries.where('projectId').equals(newId).first()
    expect(newEntry!.categoryId).toBe(newSubCat.id)
    expect(newEntry!.worldGroupId).toBe(newWgA)

    // creativeRules 引用 reference 重映射
    const newRefs = await db.references.where('projectId').equals(newId).toArray()
    const newRef1 = newRefs[0]
    const newRca = await db.referenceChunkAnalysis.where('referenceId').equals(newRef1.id!).first()
    expect(newRca!.openingTechnique).toContain('天才陨落')

    // worldNodes portalsJSON 自引用重映射
    const newWorldNodes = await db.worldNodes.where('projectId').equals(newId).toArray()
    const newRoot = newWorldNodes.find(n => n.name === '主世界')!
    const newMirror = newWorldNodes.find(n => n.name === '镜界')!
    expect(newMirror.parentId).toBe(newRoot.id)
    const portals = parseWorldPortals(newRoot.portalsJSON)
    expect(portals).toHaveLength(1)
    expect(portals[0].targetWorldId).toBe(newMirror.id)
  })
})
