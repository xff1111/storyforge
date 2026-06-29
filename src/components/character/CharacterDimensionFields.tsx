import type { Character } from '../../lib/types'

/** 角色完整维度(与「角色完整设计」生成的内容对应)。relationships 走「关系网」面板,此处不重复。 */
export const CHARACTER_DIMENSION_FIELDS: Array<{ key: keyof Character; label: string; rows: number }> = [
  { key: 'appearance', label: '外貌', rows: 3 },
  { key: 'personality', label: '性格', rows: 3 },
  { key: 'background', label: '背景故事', rows: 4 },
  { key: 'motivation', label: '动机', rows: 2 },
  { key: 'abilities', label: '能力', rows: 2 },
  { key: 'arc', label: '角色弧光', rows: 2 },
]

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
}

/**
 * 角色完整维度的展示/编辑区(共享)。
 * NPC / 次要 / 路人页面展开时复用——让 AI 生成的完整内容在各自页面也能看到、能改,
 * 不再被困在「角色生成」页里。空维度也显示(带占位),方便补写。
 */
export default function CharacterDimensionFields({ character, onChange }: Props) {
  return (
    <div className="space-y-2">
      {CHARACTER_DIMENSION_FIELDS.map(({ key, label, rows }) => (
        <div key={key as string} className="flex gap-2">
          <span className="w-12 flex-shrink-0 pt-1.5 text-xs text-text-muted">{label}</span>
          <textarea
            value={(character[key] as string) || ''}
            onChange={e => onChange({ [key]: e.target.value } as Partial<Character>)}
            placeholder={`${label}…`}
            rows={rows}
            className="flex-1 px-2 py-1 bg-bg-base border border-border rounded text-xs text-text-primary resize-y focus:outline-none focus:border-accent"
          />
        </div>
      ))}
    </div>
  )
}
