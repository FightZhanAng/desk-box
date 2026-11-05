import type { Group } from '@shared/types'
import { CloseIcon } from './icons'

interface Props {
  count: number
  total: number
  groups: Group[]
  /** 当前所在分组，用来把「移动到」的当前分组排除掉 */
  groupId: string | null
  /** 选中的条目是否已经全部固定，决定按钮是「固定」还是「取消固定」 */
  pinned: boolean
  onOpen: () => void
  onPin: (pinned: boolean) => void
  onMove: (groupId: string) => void
  onRemove: () => void
  onSelectAll: () => void
  onClear: () => void
}

/**
 * 多选时浮在底部工具条上方的批量操作条。
 *
 * 为什么不塞进 Dock：Dock 常驻，按钮一多就把「收纳新东西」压成次要动作，
 * 而选中状态本身是临时的 —— 临时状态配临时界面，收起时 Dock 原样回来。
 */
export function SelectionBar({
  count,
  total,
  groups,
  groupId,
  pinned,
  onOpen,
  onPin,
  onMove,
  onRemove,
  onSelectAll,
  onClear
}: Props) {
  const targets = groups.filter((group) => group.id !== groupId)

  return (
    <div className="selectbar">
      <span className="selectbar__count">已选 {count}</span>

      <div className="selectbar__actions">
        <button type="button" className="selectbar__btn" onClick={onOpen} data-tip="打开选中的文件、文件夹和链接">
          打开
        </button>
        <button
          type="button"
          className="selectbar__btn"
          onClick={() => onPin(!pinned)}
          data-tip={pinned ? '取消固定' : '固定到最前'}
        >
          {pinned ? '取消固定' : '固定'}
        </button>

        {targets.length > 0 && (
          <div className="selectbar__menu">
            <button type="button" className="selectbar__btn" data-tip="把选中的条目整组移到另一个分组">
              移动
            </button>
            <div className="selectbar__menu-list">
              {targets.map((group) => (
                <button key={group.id} type="button" onClick={() => onMove(group.id)}>
                  {group.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="selectbar__btn is-danger" onClick={onRemove} data-tip="从收纳盒移除记录（不动原文件）">
          移除
        </button>
      </div>

      {count < total && (
        <button type="button" className="selectbar__link" onClick={onSelectAll} data-tip="选中当前列表里的全部条目">
          全选
        </button>
      )}

      <button type="button" className="selectbar__close" onClick={onClear} aria-label="取消选择"
        data-tip="取消选择（Esc）">
        <CloseIcon />
      </button>
    </div>
  )
}
