import { useState } from 'react'
import type { Group } from '@shared/types'
import { PlusIcon } from './icons'

interface Props {
  groups: Group[]
  counts: Map<string, number>
  total: number
  active: string | null
  onSelect: (id: string | null) => void
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  onRemove: (id: string) => void
}

interface MenuState {
  id: string
  name: string
  x: number
  y: number
}

export function GroupTabs({ groups, counts, total, active, onSelect, onAdd, onRename, onRemove }: Props) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)

  const commitCreate = (): void => {
    const name = draft.trim()
    setCreating(false)
    setDraft('')
    if (name) onAdd(name)
  }

  const commitRename = (): void => {
    const id = editingId
    const name = editDraft.trim()
    setEditingId(null)
    setEditDraft('')
    if (id && name) onRename(id, name)
  }

  return (
    <>
      <nav className="groups">
        <button
          type="button"
          className={`group-pill ${active === null ? 'is-active' : ''}`}
          onClick={() => onSelect(null)}
        >
          全部
          <span className="group-pill__count">{total}</span>
        </button>

        {groups.map((group) =>
          editingId === group.id ? (
            <input
              key={group.id}
              className="group-new"
              value={editDraft}
              autoFocus
              onChange={(event) => setEditDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                if (event.key === 'Escape') {
                  setEditingId(null)
                  setEditDraft('')
                }
              }}
            />
          ) : (
            <button
              key={group.id}
              type="button"
              className={`group-pill ${active === group.id ? 'is-active' : ''}`}
              onClick={() => onSelect(group.id)}
              onDoubleClick={() => {
                setEditingId(group.id)
                setEditDraft(group.name)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu({
                  id: group.id,
                  name: group.name,
                  x: Math.min(event.clientX, window.innerWidth - 130),
                  y: Math.min(event.clientY, window.innerHeight - 84)
                })
              }}
              title="双击重命名 · 右键更多"
            >
              {group.name}
              {(counts.get(group.id) ?? 0) > 0 && (
                <span className="group-pill__count">{counts.get(group.id)}</span>
              )}
            </button>
          )
        )}

        {creating ? (
          <input
            className="group-new"
            value={draft}
            autoFocus
            placeholder="分组名"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitCreate}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitCreate()
              if (event.key === 'Escape') {
                setCreating(false)
                setDraft('')
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="group-add"
            onClick={() => setCreating(true)}
            title="新建分组"
          >
            <PlusIcon />
          </button>
        )}
      </nav>

      {menu && (
        <div
          className="ctx"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={() => {
              setEditingId(menu.id)
              setEditDraft(menu.name)
              setMenu(null)
            }}
          >
            重命名
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => {
              onRemove(menu.id)
              setMenu(null)
            }}
          >
            删除分组
          </button>
        </div>
      )}
    </>
  )
}
