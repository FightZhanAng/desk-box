# 05 · IPC 参考与 DeskboxApi 契约

本文是主进程 ⇄ 渲染层的完整接口清单。通道名唯一来源是 [src/shared/types.ts](../src/shared/types.ts) 的 `IPC` 常量；桥接实现是 [src/preload/index.ts](../src/preload/index.ts)；主进程注册在 [src/main/ipc.ts](../src/main/ipc.ts)。

---

## 1. 通用约定

### 请求方式

| 方式 | 使用场景 |
| --- | --- |
| `ipcRenderer.invoke` / `ipcMain.handle` | 需要返回值的操作（绝大多数） |
| `ipcRenderer.send` / `ipcMain.on` | 右键菜单、原生拖拽（必须同步） |
| `webContents.send` / `ipcRenderer.on` | 主进程主动推送 |

### 返回值

写操作统一返回 `ActionResult`：

```ts
{
  ok: boolean          // false 表示抛异常
  message?: string     // 给用户看的提示
  cancelled?: boolean  // 用户在原生对话框点了取消
  state: AppState      // 最新完整状态
}
```

读操作直接返回对应类型（`AppState` / `string` / `string | null` / `UpdateState`）。

### 状态推送

| 通道 | 方向 | 触发 |
| --- | --- | --- |
| `state:changed` | 主 → 渲染 | 托盘操作、原生菜单、快捷键、设置联动 |
| `update:changed` | 主 → 渲染 | 更新状态任意迁移 |

预加载把这两者包装成 `onStateChanged` / `onUpdateChanged`，返回取消订阅函数。

---

## 2. 通道总表

### 2.1 状态

| 通道 | 常量 | 方向/注册 | 参数 | 返回 | 主进程实现 |
| --- | --- | --- | --- | --- | --- |
| `state:get` | `IPC.stateGet` | invoke | — | `AppState` | `buildState()` |
| `state:changed` | `IPC.stateChanged` | main → renderer | `AppState` | — | `pushState()` |

### 2.2 条目（单条）

| 通道 | 常量 | 参数 | 返回 | 主进程行为 |
| --- | --- | --- | --- | --- |
| `item:add` | `IPC.itemAdd` | `NewItemInput` | `ActionResult` | 校验 `target`，`addItem` |
| `item:update` | `IPC.itemUpdate` | `(id, patch)` | `ActionResult` | 仅 title/note/pinned/groupId 生效 |
| `item:remove` | `IPC.itemRemove` | `id` | `ActionResult` | 只删记录，提示“原文件没有改动” |
| `item:open` | `IPC.itemOpen` | `id` | `ActionResult` | 失败时 `ok:false` + 原因 |
| `item:reveal` | `IPC.itemReveal` | `id` | `ActionResult` | `shell.showItemInFolder` |
| `item:copy` | `IPC.itemCopy` | `id` | `ActionResult` | 提示“已复制” |
| `item:icon` | `IPC.itemIcon` | `id` | `string \| null` | PNG data URL 或 null |

### 2.3 条目（批量）

| 通道 | 常量 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- | --- |
| `item:add-paths` | `IPC.itemAddPaths` | `(paths[], groupId?)` | `ActionResult` | 拖入/选择文件；返回“新增/重复/跳过”文案 |
| `item:update-many` | `IPC.itemUpdateMany` | `(ids[], patch)` | `ActionResult` | 只落盘一次；0 条变化时提示“已经是这个状态” |
| `item:remove-many` | `IPC.itemRemoveMany` | `ids[]` | `ActionResult` | 多于 1 条弹确认；取消返回 `cancelled` |
| `item:open-many` | `IPC.itemOpenMany` | `ids[]` | `ActionResult` | 全部失败则 `ok:false` |
| `item:reorder` | `IPC.itemReorder` | `ids[]` | `ActionResult` | 手动排序“座位”算法 |

### 2.4 菜单与拖拽（同步）

| 通道 | 常量 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- | --- |
| `item:menu` | `IPC.itemMenu` | `id` | — | `ipcMain.on`，原生单条右键菜单 |
| `item:menu-many` | `IPC.itemMenuMany` | `ids[]` | — | `ipcMain.on`，多选菜单；1 条时退回单条 |
| `item:drag` | `IPC.itemDrag` | `id` | — | `ipcMain.on`，`webContents.startDrag` |

### 2.5 分组

| 通道 | 常量 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- | --- |
| `group:add` | `IPC.groupAdd` | `name` | `ActionResult` | 空名/重名 `ok:false` |
| `group:rename` | `IPC.groupRename` | `(id, name)` | `ActionResult` | trim 后为空忽略 |
| `group:remove` | `IPC.groupRemove` | `id` | `ActionResult` | 至少保留一个；条目迁移 |
| `group:reorder` | `IPC.groupReorder` | `ids[]` | `ActionResult` | 重编号 `0..n-1` |

### 2.6 设置与窗口

| 通道 | 常量 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- | --- |
| `settings:patch` | `IPC.settingsPatch` | `Partial<Settings>` | `ActionResult` | 应用副作用并刷新托盘菜单 |
| `win:hide` | `IPC.windowHide` | — | `void` | 隐藏窗口 |
| `win:toggle-pin` | `IPC.windowTogglePin` | — | `ActionResult` | 翻转置顶，同步 settings + 托盘 |
| `win:minimize` | `IPC.windowMinimize` | — | — | **仅定义常量，当前未注册也未暴露** |

`win:toggle-pin` 与 `settings:patch` 的区别：前者用于标题栏图钉按钮，直接翻转当前窗口状态；后者是设置页批量修改。

### 2.7 对话框与剪贴板

| 通道 | 常量 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- | --- |
| `dialog:pick-files` | `IPC.pickFiles` | — | `ActionResult` | 多选文件 → 收纳；取消返回 `ok:true` 无提示 |
| `dialog:pick-folder` | `IPC.pickFolder` | — | `ActionResult` | 多选文件夹 |
| `clipboard:read` | `IPC.readClipboard` | — | `string` | 读取文本 |

这两个对话框操作会 `lockAutoHide()`，防止窗口失焦先收起。

### 2.8 Shell 与数据

| 通道 | 常量 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- | --- |
| `shell:open-external` | `IPC.openExternal` | `url` | `ActionResult` | 仅允许 `http:` / `https:` |
| `data:export` | `IPC.exportData` | — | `ActionResult` | 保存对话框导出 JSON |
| `data:import` | `IPC.importData` | — | `ActionResult` | 打开 JSON 恢复；取消提示“已取消恢复” |

`getPathForFile` 不经 IPC，由 preload 直接调用 `webUtils.getPathForFile(file)`，同步返回本地绝对路径。

### 2.9 更新

| 通道 | 常量 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- | --- |
| `update:get` | `IPC.updateGet` | — | `UpdateState` | 当前更新状态 |
| `update:check` | `IPC.updateCheck` | — | `UpdateState` | 手动检查；检查中/下载中直接返回当前状态 |
| `update:download` | `IPC.updateDownload` | — | `UpdateState` | 仅 `available` 时生效 |
| `update:install` | `IPC.updateInstall` | — | `void` | 仅 `downloaded` 时 `quitAndInstall` |
| `update:open-page` | `IPC.updateOpenPage` | — | `void` | 打开 GitHub Release |
| `update:changed` | `IPC.updateChanged` | 主 → 渲染 | `UpdateState` | 状态迁移广播 |

---

## 3. DeskboxApi 与通道对照

文件：[src/shared/api.ts](../src/shared/api.ts)

| API 方法 | 通道 | 调用方式 |
| --- | --- | --- |
| `getState()` | `state:get` | invoke |
| `onStateChanged(cb)` | `state:changed` | on + 取消订阅 |
| `addItem(input)` | `item:add` | invoke |
| `addPaths(paths, groupId?)` | `item:add-paths` | invoke |
| `updateItem(id, patch)` | `item:update` | invoke |
| `removeItem(id)` | `item:remove` | invoke |
| `openItem(id)` | `item:open` | invoke |
| `revealItem(id)` | `item:reveal` | invoke |
| `copyItem(id)` | `item:copy` | invoke |
| `updateItems(ids, patch)` | `item:update-many` | invoke |
| `removeItems(ids)` | `item:remove-many` | invoke |
| `openItems(ids)` | `item:open-many` | invoke |
| `reorderItems(ids)` | `item:reorder` | invoke |
| `showItemMenu(id)` | `item:menu` | send |
| `showBatchMenu(ids)` | `item:menu-many` | send |
| `startDrag(id)` | `item:drag` | send |
| `addGroup(name)` | `group:add` | invoke |
| `renameGroup(id, name)` | `group:rename` | invoke |
| `removeGroup(id)` | `group:remove` | invoke |
| `reorderGroups(ids)` | `group:reorder` | invoke |
| `patchSettings(patch)` | `settings:patch` | invoke |
| `pickFiles()` | `dialog:pick-files` | invoke |
| `pickFolder()` | `dialog:pick-folder` | invoke |
| `readClipboard()` | `clipboard:read` | invoke |
| `openExternal(url)` | `shell:open-external` | invoke |
| `exportData()` | `data:export` | invoke |
| `importData()` | `data:import` | invoke |
| `hideWindow()` | `win:hide` | invoke |
| `togglePin()` | `win:toggle-pin` | invoke |
| `getPathForFile(file)` | 无（`webUtils`） | 同步 |
| `getItemIcon(id)` | `item:icon` | invoke |
| `getUpdate()` | `update:get` | invoke |
| `checkUpdate()` | `update:check` | invoke |
| `downloadUpdate()` | `update:download` | invoke |
| `installUpdate()` | `update:install` | invoke |
| `openUpdatePage()` | `update:open-page` | invoke |
| `onUpdateChanged(cb)` | `update:changed` | on + 取消订阅 |

---

## 4. 调用示例

### 4.1 拖入文件

```tsx
// 渲染层
const paths = Array.from(event.dataTransfer.files).map(
  (file) => window.deskbox.getPathForFile(file)
)
const result = await window.deskbox.addPaths(paths, groupId)
setState(result.state)
if (result.message) toast(result.message)
```

### 4.2 批量固定

```tsx
// 一次 IPC，一次落盘，一次回传
const result = await window.deskbox.updateItems(visibleSelectedIds, { pinned: true })
```

### 4.3 主进程主动推送

```ts
// actions.ts
export function pushState(): void {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('state:changed', buildState())
}
```

---

## 5. 新增通道的标准步骤

1. 在 [types.ts](../src/shared/types.ts) 的 `IPC` 常量里加通道名。
2. 在 [api.ts](../src/shared/api.ts) 的 `DeskboxApi` 里加方法签名。
3. 在 [preload/index.ts](../src/preload/index.ts) 实现桥接。
4. 在 [ipc.ts](../src/main/ipc.ts) 注册 `handle` 或 `on`。
5. 在 [actions.ts](../src/main/actions.ts) 写业务，必要时 `pushState()`。
6. 更新本 Wiki 的表格。

> 命名约定：`域:动作`，域取 `state / item / group / settings / dialog / clipboard / shell / data / win / update`。

---

## 6. 注意事项

| 项 | 说明 |
| --- | --- |
| 同步通道不可改 invoke | 右键菜单与拖拽依赖同一事件循环时机 |
| 参数必须防御 | 主进程对 `ids`/`patch` 做 `Array.isArray` 与默认值兜底 |
| 异常不要外泄 | `withState` 统一转 `ok:false`，避免 unhandled rejection |
| 取消不是失败 | `cancelled: true` 时界面不应清空选择或弹错误 |
| 状态一致性 | 任何修改数据的路径最终都要返回或推送最新 `AppState` |
| 未使用常量 | `win:minimize` 目前是死代码，改动时可顺手清理 |

下一步阅读：[06-icon-subsystem.md](./06-icon-subsystem.md)。
