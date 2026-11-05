import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Group, ItemView } from '@shared/types'
import { ChevronRightIcon } from './icons'

/** 菜单里能触发的动作。渲染层只描述「点了什么」，落地由 App 统一走 IPC */
export type ItemMenuAction =
  | { type: 'open' }
  | { type: 'reveal' }
  | { type: 'copy' }
  | { type: 'pin'; pinned: boolean }
  | { type: 'move'; groupId: string }
  | { type: 'remove' }

interface Props {
  item: ItemView
  groups: Group[]
  /** 各分组现有条数，只用在「移动到分组」子菜单的计数上 */
  counts: Map<string, number>
  /** 右键位置（clientX / clientY） */
  x: number
  y: number
  onAction: (action: ItemMenuAction) => void
  onClose: () => void
}

interface Entry {
  id: string
  label: string
  /** 右侧灰字提示，只写真实成立的快捷方式，别编 */
  hint?: string
  danger?: boolean
  action?: ItemMenuAction
  submenu?: { id: string; label: string; count: number }[]
}

/** 贴着窗口边缘留的安全距离，跟排序菜单那个 6 对齐 */
const EDGE = 6

function buildSections(item: ItemView, groups: Group[], counts: Map<string, number>): Entry[][] {
  const isPath = item.kind === 'file' || item.kind === 'folder'
  const isText = item.kind === 'text'

  // 第一段：跟「打开 / 取出」相关的只读动作
  const primary: Entry[] = [
    {
      id: 'open',
      label: isText ? '复制到剪贴板' : '打开',
      hint: isText ? undefined : '双击',
      action: { type: 'open' }
    }
  ]
  if (isPath) {
    primary.push({ id: 'reveal', label: '在文件夹中显示', action: { type: 'reveal' } })
    primary.push({ id: 'copy', label: '复制完整路径', action: { type: 'copy' } })
  }
  if (item.kind === 'link') {
    primary.push({ id: 'copy', label: '复制链接', action: { type: 'copy' } })
  }

  // 第二段：改归属
  const targets = groups.filter((group) => group.id !== item.groupId)
  const ops: Entry[] = [
    {
      id: 'pin',
      label: item.pinned ? '取消固定' : '固定到最前',
      action: { type: 'pin', pinned: !item.pinned }
    }
  ]
  if (targets.length > 0) {
    ops.push({
      id: 'move',
      label: '移动到分组',
      submenu: targets.map((group) => ({
        id: group.id,
        label: group.name,
        count: counts.get(group.id) ?? 0
      }))
    })
  }

  // 第三段：破坏性操作，单独隔开
  return [primary, ops, [{ id: 'remove', label: '从收纳盒移除', danger: true, action: { type: 'remove' } }]]
}

/**
 * 卡片右键菜单。
 *
 * 之前这里是主进程的原生菜单，好处是自带系统级键盘与边缘翻转，坏处是
 * 长得跟这套玻璃面板毫无关系 —— 白底、硬线、系统字体，一弹出来像是另一
 * 个程序。现在改成渲染层自绘，跟排序菜单共用 `.ctx` 这套浮层样式。
 *
 * 自绘就得自己补回原生菜单白送的三件事：贴边翻转、点外面/Esc 关闭、
 * 上下键在条目间走。子菜单额外要处理「右边放不下就翻到左边」。
 */
export function ItemMenu({ item, groups, counts, x, y, onAction, onClose }: Props) {
  const sections = useMemo(() => buildSections(item, groups, counts), [item, groups, counts])
  const entries = useMemo(() => sections.flat(), [sections])

  const panelRef = useRef<HTMLDivElement | null>(null)
  const subRef = useRef<HTMLDivElement | null>(null)
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>())

  const [pos, setPos] = useState({ x, y })
  const [activeId, setActiveId] = useState<string | null>(null)
  /** 当前展开了子菜单的条目 id；null = 没展开 */
  const [subFor, setSubFor] = useState<string | null>(null)
  const [subFlip, setSubFlip] = useState(false)
  const [subTop, setSubTop] = useState(0)
  const [subHeight, setSubHeight] = useState<number | null>(null)
  const [subActiveId, setSubActiveId] = useState<string | null>(null)

  /* ---------------------------------------------------------------- 定位 */

  // 先按右键位置画出去，再按实测尺寸把它推回窗口内。useLayoutEffect 里
  // 改 state 会赶在绘制之前重排，看不到跳一下
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - EDGE
    const maxY = window.innerHeight - rect.height - EDGE
    setPos({
      x: Math.max(EDGE, Math.min(x, Math.max(EDGE, maxX))),
      y: Math.max(EDGE, Math.min(y, Math.max(EDGE, maxY)))
    })
  }, [x, y])

  useLayoutEffect(() => {
    if (!subFor) return
    const panel = panelRef.current
    const sub = subRef.current
    if (!panel || !sub) return
    const panelRect = panel.getBoundingClientRect()
    const subRect = sub.getBoundingClientRect()
    setSubFlip(panelRect.right + subRect.width + EDGE > window.innerWidth - EDGE)

    /* 子菜单必须跟「移动到分组」这一行对齐，否则用户看不出它是从哪儿展开的。
       所以先不动位置，改高度去适配下方剩余空间；真的矮到读不了（< 160px）
       才把整块往上顶，那属于窗口本身就装不下的极端情况。 */
    const triggerTop = triggerRefs.current.get(subFor)?.offsetTop ?? 0
    const naturalH = sub.scrollHeight + 2 // + 上下边框
    const room = window.innerHeight - EDGE - (panelRect.top + triggerTop)
    const height = Math.min(naturalH, Math.max(160, room))
    setSubHeight(height)
    setSubTop(
      Math.min(triggerTop, Math.max(EDGE - panelRect.top, window.innerHeight - EDGE - height - panelRect.top))
    )
  }, [subFor])

  /* ---------------------------------------------------------------- 关闭 */

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (panelRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onDismiss = (): void => onClose()
    // 捕获阶段拦：卡片自己的 mousedown 要先生效的话，菜单会留在原地
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', onDismiss)
    window.addEventListener('resize', onDismiss)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', onDismiss)
      window.removeEventListener('resize', onDismiss)
    }
  }, [onClose])

  /* ---------------------------------------------------------------- 交互 */

  const submenuOf = (id: string | null): { id: string; label: string; count: number }[] =>
    entries.find((entry) => entry.id === id)?.submenu ?? []

  const openSub = (id: string): void => {
    setSubFor(id)
    setSubTop(triggerRefs.current.get(id)?.offsetTop ?? 0)
    setSubActiveId(submenuOf(id)[0]?.id ?? null)
  }

  const activate = (entry: Entry): void => {
    if (entry.submenu) {
      openSub(entry.id)
      return
    }
    if (!entry.action) return
    onAction(entry.action)
    onClose()
  }

  const step = (list: string[], current: string | null, delta: number): string | null => {
    if (list.length === 0) return null
    const index = current ? list.indexOf(current) : -1
    if (index < 0) return list[delta > 0 ? 0 : list.length - 1]
    return list[(index + delta + list.length) % list.length]
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      // 这里必须截住：App 的全局 Esc 会顺手清空选中，而菜单只是「退出这一层」
      event.stopPropagation()
      if (subFor) setSubFor(null)
      else onClose()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      if (subFor) {
        setSubActiveId(step(submenuOf(subFor).map((entry) => entry.id), subActiveId, delta))
      } else {
        setActiveId(step(entries.map((entry) => entry.id), activeId, delta))
      }
      return
    }

    if (event.key === 'ArrowRight') {
      if (subFor || !activeId) return
      const entry = entries.find((candidate) => candidate.id === activeId)
      if (entry?.submenu) {
        event.preventDefault()
        openSub(entry.id)
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      if (!subFor) return
      event.preventDefault()
      setSubFor(null)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (subFor) {
        const target = submenuOf(subFor).find((entry) => entry.id === subActiveId)
        if (!target) return
        onAction({ type: 'move', groupId: target.id })
        onClose()
        return
      }
      const entry = entries.find((candidate) => candidate.id === activeId)
      if (entry) activate(entry)
    }
  }

  const subEntries = submenuOf(subFor)

  return (
    <div
      className="ctx item-menu"
      role="menu"
      aria-label={`${item.title} 的操作`}
      tabIndex={-1}
      ref={panelRef}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {sections.map((section, index) => (
        <Fragment key={section[0]?.id ?? index}>
          {index > 0 && <div className="ctx__sep" />}
          {section.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              ref={(el) => {
                if (el) triggerRefs.current.set(entry.id, el)
                else triggerRefs.current.delete(entry.id)
              }}
              aria-haspopup={entry.submenu ? 'menu' : undefined}
              aria-expanded={entry.submenu ? subFor === entry.id : undefined}
              className={[
                'ctx__item',
                entry.danger ? 'is-danger' : '',
                activeId === entry.id ? 'is-active' : '',
                entry.submenu ? 'has-sub' : '',
                entry.submenu && subFor === entry.id ? 'is-open' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => {
                setActiveId(entry.id)
                if (entry.submenu) {
                  if (subFor !== entry.id) openSub(entry.id)
                } else if (subFor) {
                  setSubFor(null)
                }
              }}
              onClick={() => activate(entry)}
            >
              <span className="ctx__label">{entry.label}</span>
              {entry.hint && <span className="ctx__count">{entry.hint}</span>}
              {entry.submenu && <ChevronRightIcon className="ctx__chev" />}
            </button>
          ))}
        </Fragment>
      ))}

      {subFor && subEntries.length > 0 && (
        <div
          className={`ctx ctx__sub ${subFlip ? 'is-flip' : ''}`}
          role="menu"
          aria-label="移动到分组"
          ref={subRef}
          style={{ top: subTop, maxHeight: subHeight ?? undefined }}
        >
          {subEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              className={`ctx__item ${subActiveId === entry.id ? 'is-active' : ''}`}
              onMouseEnter={() => setSubActiveId(entry.id)}
              onClick={() => {
                onAction({ type: 'move', groupId: entry.id })
                onClose()
              }}
            >
              <span className="ctx__label">{entry.label}</span>
              <span className="ctx__count">{entry.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
