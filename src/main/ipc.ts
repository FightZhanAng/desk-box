import { clipboard, ipcMain, shell } from 'electron'
import { IPC } from '../shared/types'
import type { ActionResult, NewItemInput, Settings } from '../shared/types'
import {
  addGroup,
  addItem,
  addPaths,
  buildState,
  copyItemTarget,
  describeAddPaths,
  describeBatchPatch,
  describeOpenMany,
  exportData,
  getItemIcon,
  importData,
  openItem,
  openItems,
  patchSettings,
  promptAddFiles,
  promptAddFolder,
  removeGroup,
  removeItem,
  removeItemsConfirmed,
  renameGroup,
  reorderGroups,
  reorderItems,
  revealItem,
  showBatchMenu,
  showItemMenu,
  startDragItem,
  updateItem,
  updateItems
} from './actions'
import { refreshTrayMenu } from './tray'
import {
  checkForUpdate,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  openReleasePage
} from './updater'
import { getWindow } from './window'

/**
 * 统一包装：执行写操作 → 回传最新状态。
 * 任何异常都转成 ok:false + message，绝不让渲染层拿到一个 unhandled rejection。
 * 任务也可以返回 { cancelled: true } 表示用户在原生对话框里点了取消。
 */
type TaskOutcome = string | void | { message?: string; cancelled?: boolean }

async function withState(task: () => TaskOutcome | Promise<TaskOutcome>): Promise<ActionResult> {
  try {
    const outcome = await task()
    const message = typeof outcome === 'string' ? outcome : outcome?.message
    const cancelled =
      typeof outcome === 'object' && outcome !== null ? outcome.cancelled === true : false
    return { ok: true, message: message ?? undefined, cancelled, state: await buildState() }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '操作失败',
      state: await buildState()
    }
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.stateGet, () => buildState())

  ipcMain.handle(IPC.itemAdd, (_event, input: NewItemInput) =>
    withState(() => {
      if (!input || typeof input.target !== 'string') throw new Error('内容为空')
      if (!addItem(input)) throw new Error('内容为空或没有可用的分组')
    })
  )

  ipcMain.handle(IPC.itemAddPaths, (_event, paths: string[], groupId?: string) =>
    withState(() => {
      const list = Array.isArray(paths) ? paths : []
      return describeAddPaths(addPaths(list, groupId))
    })
  )

  ipcMain.handle(IPC.itemUpdate, (_event, id: string, patch: Record<string, unknown>) =>
    withState(() => {
      updateItem(id, patch ?? {})
    })
  )

  ipcMain.handle(IPC.itemRemove, (_event, id: string) =>
    withState(() => {
      removeItem(id)
      return '已从盒子移除（原文件没有改动）'
    })
  )

  /* ---------------------------------------------------------- 批量操作 */

  ipcMain.handle(IPC.itemUpdateMany, (_event, ids: string[], patch: Record<string, unknown>) =>
    withState(() => {
      const list = Array.isArray(ids) ? ids : []
      const changed = updateItems(list, patch ?? {})
      if (changed === 0) return '选中的条目已经是这个状态'
      return describeBatchPatch(patch ?? {}, changed)
    })
  )

  ipcMain.handle(IPC.itemRemoveMany, (_event, ids: string[]) =>
    withState(async () => {
      const list = Array.isArray(ids) ? ids : []
      const removed = await removeItemsConfirmed(list)
      // 0 条有两种可能：全都不存在了，或者用户点了取消 —— 后者不该弹提示
      if (removed === 0) return { cancelled: true }
      return `已从盒子移除 ${removed} 项（原文件没有改动）`
    })
  )

  ipcMain.handle(IPC.itemOpenMany, (_event, ids: string[]) =>
    withState(async () => {
      const list = Array.isArray(ids) ? ids : []
      if (list.length === 0) throw new Error('没有选中任何条目')
      const outcome = await openItems(list)
      const message = describeOpenMany(outcome)
      // 一项都没打开就是失败，让界面走警告样式的提示
      if (outcome.opened === 0) throw new Error(message || '这些条目打不开')
      return message
    })
  )

  ipcMain.handle(IPC.itemReorder, (_event, ids: string[]) =>
    withState(() => {
      const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
      const changed = reorderItems(list)
      if (changed === 0) return '顺序没有变化'
      return '已保存新顺序'
    })
  )

  ipcMain.handle(IPC.itemOpen, (_event, id: string) =>
    withState(async () => {
      const error = await openItem(id)
      if (error) throw new Error(error)
    })
  )

  ipcMain.handle(IPC.itemReveal, (_event, id: string) =>
    withState(() => {
      revealItem(id)
    })
  )

  ipcMain.handle(IPC.itemCopy, (_event, id: string) =>
    withState(() => {
      copyItemTarget(id)
      return '已复制'
    })
  )

  // 右键菜单与拖拽必须是同步的：异步往返会让菜单错过弹窗时机、拖拽丢失上下文
  ipcMain.on(IPC.itemMenu, (_event, id: string) => {
    showItemMenu(id)
  })

  ipcMain.on(IPC.itemMenuMany, (_event, ids: string[]) => {
    showBatchMenu(Array.isArray(ids) ? ids : [])
  })

  ipcMain.on(IPC.itemDrag, (_event, id: string) => {
    startDragItem(id)
  })

  ipcMain.handle(IPC.groupAdd, (_event, name: string) =>
    withState(() => {
      if (!addGroup(name)) throw new Error('分组名为空或已存在')
      return '分组已创建'
    })
  )

  ipcMain.handle(IPC.groupRename, (_event, id: string, name: string) =>
    withState(() => {
      renameGroup(id, name)
    })
  )

  ipcMain.handle(IPC.groupRemove, (_event, id: string) =>
    withState(() => {
      if (!removeGroup(id)) throw new Error('至少要保留一个分组')
      return '分组已删除，里面的条目已移到其他分组'
    })
  )

  ipcMain.handle(IPC.groupReorder, (_event, ids: string[]) =>
    withState(() => {
      const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
      const changed = reorderGroups(list)
      if (changed === 0) return '分组顺序没有变化'
      return '已保存分组顺序'
    })
  )

  ipcMain.handle(IPC.settingsPatch, (_event, patch: Partial<Settings>) =>
    withState(() => {
      patchSettings(patch ?? {})
      refreshTrayMenu()
    })
  )

  ipcMain.handle(IPC.pickFiles, () =>
    withState(async () => {
      const added = await promptAddFiles()
      return added > 0 ? `已收纳 ${added} 项` : undefined
    })
  )

  ipcMain.handle(IPC.pickFolder, () =>
    withState(async () => {
      const added = await promptAddFolder()
      return added > 0 ? `已收纳 ${added} 项` : undefined
    })
  )

  ipcMain.handle(IPC.readClipboard, () => clipboard.readText())

  ipcMain.handle(IPC.openExternal, (_event, url: string) =>
    withState(async () => {
      // 只放行 http/https：避免渲染层被注入 file:// 或自定义协议去拉起本机程序
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        throw new Error('链接格式不正确')
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('只支持 http / https 链接')
      }
      await shell.openExternal(parsed.toString())
    })
  )

  ipcMain.handle(IPC.exportData, () =>
    withState(async () => {
      const target = await exportData()
      return target ? `已导出到 ${target}` : '已取消导出'
    })
  )

  ipcMain.handle(IPC.importData, () =>
    withState(async () => {
      const done = await importData()
      if (!done) return '已取消恢复'
      return '数据已恢复'
    })
  )

  ipcMain.handle(IPC.windowHide, () => {
    getWindow()?.hide()
  })

  ipcMain.handle(IPC.windowTogglePin, () =>
    withState(() => {
      const win = getWindow()
      if (!win) return
      const next = !win.isAlwaysOnTop()
      win.setAlwaysOnTop(next, 'floating')
      patchSettings({ alwaysOnTop: next })
      refreshTrayMenu()
      return next ? '已置顶' : '已取消置顶'
    })
  )

  /* ------------------------------------------------------------ 系统图标 */

  ipcMain.handle(IPC.itemIcon, (_event, id: string) => getItemIcon(String(id ?? '')))

  /* -------------------------------------------------------------- 更新 */

  ipcMain.handle(IPC.updateGet, () => getUpdateState())
  ipcMain.handle(IPC.updateCheck, () => checkForUpdate())
  ipcMain.handle(IPC.updateDownload, () => downloadUpdate())
  ipcMain.handle(IPC.updateInstall, () => {
    installUpdate()
  })
  ipcMain.handle(IPC.updateOpenPage, () => {
    openReleasePage()
  })
}
