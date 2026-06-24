/**
 * NS-4 · 事实库面板 — 审阅事实账本候选、确认升 Canon / 否决。
 * 所有变更走 useFactLedgerStore（→ lib/fact-ledger 单一入口），面板不裸写 db。
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, X, Database } from 'lucide-react'
import type { Project } from '../../lib/types'
import { useFactLedgerStore } from '../../stores/fact-ledger'
import { getFactPredicate } from '../../lib/registry/fact-predicate-registry'
import type { FactStatus } from '../../lib/types/temporal-fact'

const STATUS_TABS: { key: FactStatus; label: string }[] = [
  { key: 'candidate', label: '待确认候选' },
  { key: 'confirmed', label: '已确认 Canon' },
  { key: 'superseded', label: '已被取代' },
  { key: 'rejected', label: '已否决' },
]

export default function FactLibraryPanel({ project }: { project: Project }) {
  const { facts, loading, load, confirmFact, rejectFact } = useFactLedgerStore()
  const [tab, setTab] = useState<FactStatus>('candidate')

  useEffect(() => { if (project.id != null) void load(project.id) }, [project.id, load])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of facts) c[f.status] = (c[f.status] ?? 0) + 1
    return c
  }, [facts])

  const rows = useMemo(() => facts.filter(f => f.status === tab), [facts, tab])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Database className="w-5 h-5 text-sky-400" />
        <h1 className="text-lg font-bold text-text-primary">事实库（NS-4 长期一致性）</h1>
      </div>
      <p className="text-xs text-text-muted mb-4">
        在章节里点「提取事实」抽取候选；确认后的事实会在写后续章节时自动注入，防止前后矛盾。证据引文逐字来自正文。
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${tab === t.key ? 'bg-sky-500/20 text-sky-300' : 'bg-bg-elevated text-text-muted hover:text-text-secondary'}`}>
            {t.label}{counts[t.key] ? `（${counts[t.key]}）` : ''}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-text-muted">加载中…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-text-muted py-8 text-center">暂无{STATUS_TABS.find(t => t.key === tab)?.label}。</p>
      )}

      <div className="space-y-2">
        {rows.map(f => {
          const spec = getFactPredicate(f.predicate)
          return (
            <div key={f.id} className="flex items-start gap-3 p-3 bg-bg-elevated rounded-lg border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary">
                  <span className="font-medium">{f.subjectName}</span>
                  <span className="text-text-muted"> · {spec?.label ?? f.predicate}：</span>
                  <span>{f.value}</span>
                  {f.locked && <span className="ml-2 text-[10px] text-amber-400">🔒锁定</span>}
                </p>
                {f.sourceQuote && <p className="text-xs text-text-muted mt-1 truncate">证据：“{f.sourceQuote}”</p>}
              </div>
              {f.status === 'candidate' && f.id != null && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => void confirmFact(project.id!, f.id!)} title="确认为权威事实（Canon）"
                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => void rejectFact(project.id!, f.id!)} title="否决"
                    className="p-1.5 text-rose-400 hover:bg-rose-500/15 rounded">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
