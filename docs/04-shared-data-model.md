# 04 · 共享层、数据模型与持久化

共享层位于 [src/shared](../src/shared)，同时被主进程、预加载和渲染层引用。**任何文件都不得 import `electron` 或 `react`**，否则会破坏其中一套 tsconfig。

```text
src/shared/
├─ types.ts       实体、设置、更新状态、IPC 通道常量
├─ api.ts         DeskboxApi（preload ↔ renderer 共用签名）
├─ defaults.ts    默认值、主题/排序常量、数据归一化
├─ format.ts      快捷键可读化
├─ icons.ts       哪些扩展名使用系统图标
├─ update.ts      语义化版本比较、更新状态文案
└─ url.ts         URL 规范化、域名提取、URL 判定
```

---

## 1. 数据模型（types.ts）

文件：[types.ts](../src/shared/types.ts)

### 1.1 `Item` —— 落盘的收纳项

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | `randomUUID()` |
| `kind` | `'file' \| 'folder' \| 'link' \| 'text'` | 条目类型 |
| `title` | `string` | 显示名，用户可改；为空时由 target 推导 |
| `target` | `string` | 文件/文件夹绝对路径；链接 URL；文本正文 |
| `groupId` | `string` | 所属分组 |
| `note` | `string` | 备注（参与搜索） |
| `pinned` | `boolean` | 固定到最前 |
| `createdAt` | `number` | 创建时间（毫秒） |
| `lastOpenedAt` | `number` | 最近打开时间；从未打开为 0 |
| `openCount` | `number` | 打开次数，用于「常用」与「最近打开」 |
| `order` | `number` | 手动排序位次，越小越靠前；相等时退回 `createdAt` 倒序 |

**落盘时不含 `icon`**：图标由主进程在 `buildState()` 时按需提供，避免 JSON 膨胀。

### 1.2 `ItemView` —— IPC 传输层派生

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ext` | `string` | 小写扩展名（不含点）；文件夹/链接/文本为空串 |
| `exists` | `boolean` | 文件是否还在原位；非路径类恒为 `true` |
| `linkDir` | `boolean` | `.lnk` 是否指向文件夹（这类按文件夹展示） |

`ItemView = Item + 上述三个派生字段`，只存在于主进程 → 渲染层的传输中。

### 1.3 `Group`

```ts
interface Group {
  id: string
  name: string
  order: number
}
```

### 1.4 `Settings`

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `alwaysOnTop` | `boolean` | `true` | 窗口始终置顶 |
| `hideOnBlur` | `boolean` | `false` | 点到外面自动收起 |
| `launchAtLogin` | `boolean` | `false` | 开机自启 |
| `hotkey` | `string` | `Control+Shift+Space` | Electron accelerator |
| `opacity` | `number` | `0.96` | 面板不透明度，范围 `0.78–1` |
| `density` | `'compact' \| 'comfortable'` | `comfortable` | 卡片密度 |
| `theme` | `'wood' \| 'night' \| 'celadon' \| 'indigo'` | `wood` | 配色 |
| `autoCheckUpdate` | `boolean` | `true` | 后台检查新版本 |
| `autoDownloadUpdate` | `boolean` | `false` | 发现新版本自动下载 |
| `sortBy` | `ItemSort` | `recent` | 分组内排序方式 |

### 1.5 `WindowBounds`

```ts
interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}
```

首次启动无 `x/y`，由 `window.ts` 计算默认位置。

### 1.6 `AppData` —— 落盘根结构

```ts
interface AppData {
  version: number       // 当前为 1
  groups: Group[]
  items: Item[]
  settings: Settings
  window: WindowBounds
}
```

### 1.7 `AppState` —— 传给渲染层的状态

```ts
interface AppState {
  groups: Group[]
  items: ItemView[]
  settings: Settings
  activeHotkey: string | null   // 注册失败时为 null
  platform: NodeJS.Platform
  version: string               // app.getVersion()
}
```

### 1.8 `NewItemInput` 与 `ActionResult`

```ts
interface NewItemInput {
  kind: ItemKind
  target: string
  title?: string
  groupId?: string
  note?: string
}

interface ActionResult {
  ok: boolean
  message?: string
  cancelled?: boolean   // 用户取消原生对话框
  state: AppState
}
```

`ActionResult` 的设计目标：一次返回“是否成功 + 提示文案 + 是否取消 + 最新状态”，渲染层只需一次 `setState`。

### 1.9 更新相关类型

```ts
type UpdateStatus =
  | 'unsupported' | 'idle' | 'checking' | 'latest'
  | 'available' | 'downloading' | 'downloaded' | 'error'

interface UpdateState {
  status: UpdateStatus
  current: string     // 当前版本
  latest: string      // 远端版本，未知为空串
  percent: number     // 0..100
  message: string     // 失败/不支持原因
  checkedAt: number   // 上次检查完成时间
  notes: string       // 更新说明
  canDownload: boolean
}

type UpdateAction = 'check' | 'download' | 'install' | 'page'
```

---

## 2. 默认值与归一化（defaults.ts）

文件：[defaults.ts](../src/shared/defaults.ts)

### 2.1 常量

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `DATA_VERSION` | `1` | 数据结构版本 |
| `THEME_IDS` | `['wood','night','celadon','indigo']` | 主题顺序 |
| `THEME_LABELS` | 暖木/夜墨/青瓷/靛蓝 | 显示名 |
| `SORT_IDS` | `['recent','opened','name','custom']` | 菜单顺序 |
| `SORT_LABELS` | 最近添加/最近打开/按名称/手动整理 | 显示名 |
| `FREQUENT_ID` | `'freq'` | 虚拟分组 id |
| `FREQUENT_LIMIT` | `10` | 「常用」最多条数 |
| `OPACITY_MIN` / `MAX` / `STEP` | `0.78` / `1` / `0.02` | 不透明度范围 |

### 2.2 `clampOpacity(value, fallback)`

- 非数字、`NaN`、`Infinity` 一律返回 fallback。
- 否则夹到 `[0.78, 1]`。

### 2.3 `createDefaultData()`

| 字段 | 默认值 |
| --- | --- |
| `version` | `1` |
| `groups` | `g-inbox/待处理(0)`、`g-work/工作(1)`、`g-tools/工具(2)` |
| `items` | `[]`（刻意不放示例项，避免他人机器上一堆“路径失效”） |
| `settings` | `DEFAULT_SETTINGS` |
| `window` | `{ width: 400, height: 580 }` |

### 2.4 `normalizeData(raw)` —— 容错迁移

输入任意来源的旧数据，输出结构完整的 `AppData`，**不抛错**。

| 对象 | 归一化规则 |
| --- | --- |
| 根 | 非对象直接返回默认数据 |
| `groups` | 过滤非法项；`order` 缺失按数组下标；空数组回退默认分组 |
| `items` | 过滤缺少 `id`/`target` 的项；非法 `kind` 退化为 `text` |
| 孤儿条目 | `groupId` 不在现存分组 → 落到 `groups[0]` |
| `.lnk` 标题 | 仅当标题为空或等于文件名时截掉 `.lnk`；用户改过的名字不动 |
| `order` | 缺失记为 `NaN`，整批按 `createdAt` 倒序统一编号 |
| `settings` | 合并默认值后逐项校验：非法 theme/density/sortBy 回默认，opacity 夹紧，hotkey/更新开关类型兜底 |
| `window` | 合并默认尺寸 |

`order` 播种的意义：老数据没有 `order` 字段，如果全留 0，手动拖拽时无法插入位次；按加入时间倒序编号后，显示顺序与升级前完全一致。

---

## 3. 持久化

### 3.1 文件位置

| 形态 | 路径 |
| --- | --- |
| 打包版 | `%APPDATA%/desk-box/desk-box.json` |
| 开发态 | 由 Electron `--user-data-dir` 指定的目录下 `desk-box.json` |

代码：`join(app.getPath('userData'), 'desk-box.json')`，见 [store.ts](../src/main/store.ts)。

### 3.2 写盘策略

```mermaid
flowchart LR
  A[业务改内存 cache] --> B[save 200ms 防抖]
  B --> C[writeNow]
  C --> D[写 desk-box.json.tmp]
  D --> E[rename 覆盖 desk-box.json]
```

- 原子替换：崩溃/断电时原文件仍完整。
- 退出：`flushNow()` + `flushBounds()` 立即写。
- 导入备份：`replaceData()` 归一化后立即写。

### 3.3 损坏与备份

| 场景 | 处理 |
| --- | --- |
| JSON 解析失败 | 原文件改名 `desk-box.json.broken-<timestamp>`，重建默认数据 |
| 备份失败 | 不阻塞启动 |
| 导出 | 保存对话框，文件名 `desk-box-YYYY-MM-DD.json` |
| 导入 | 解析 → `replaceData`；失败返回 `false` |

---

## 4. 排序体系

desk-box 有三层排序，逐层覆盖：

```text
① 主进程 buildState()：pinned → order → createdAt desc
② 渲染层 sortItems()：custom 原样 / recent / opened / name
③「常用」虚拟分组：openCount desc → lastOpenedAt desc → 前 10
```

### 4.1 主进程默认顺序

```ts
if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
if (a.order !== b.order) return a.order - b.order
return b.createdAt - a.createdAt
```

新条目 `order = min(order) - 1`，因此总是落在最前，且不会与已有条目撞位次（同毫秒批量拖入也稳定）。

### 4.2 渲染层排序

见 [03-renderer.md §4.1](./03-renderer.md#41-sortitemsts)。

- `recent`：保持主进程顺序（已是加入时间倒序）。
- `opened`：`lastOpenedAt` 降序；未打开过为 0，自然落后。
- `name`：拼音首字母 + 标题的本地化比较。
- `custom`：直接使用主进程给的 `order` 顺序。

**固定项在任何模式下恒在最前**——这是“钉住”的定义。

### 4.3 手动排序算法

`reorderItems(ids)` 接收“当前可见条目的目标顺序”：

1. 过滤重复/失效 id，少于 2 条直接返回 0。
2. 按当前全局顺序排序，找出这批条目占住的“座位”。
3. 把新顺序的条目依次填回这些座位。
4. 整库重编号 `0..n-1`，返回变化的条目数。

没参与排序的条目（其他分组、被搜索过滤的）保持原相对位置。

### 4.4 分组排序

`reorderGroups(ids)` 简单直接：

1. 去重、过滤不存在 id。
2. 列表内按传入顺序排，未出现的按原相对顺序补末尾。
3. 统一编号 `0..n-1`。

---

## 5. 「常用」虚拟分组

| 属性 | 实现 |
| --- | --- |
| id | `freq`（`FREQUENT_ID`） |
| 是否落盘 | 否 |
| 是否可改名/删除 | 否 |
| 条目归属 | 仍归属原分组 |
| 入选条件 | `openCount > 0` |
| 排序 | `openCount` 降序 → `lastOpenedAt` 降序 |
| 上限 | 10 |
| 显示条件 | 至少 1 条，否则不渲染胶囊 |
| 拖入行为 | 落到第一个真实分组 |
| 整理模式 | 禁止（顺序是现算的，没有落盘位置） |

渲染层实现见 [App.tsx](../src/renderer/src/App.tsx) 的 `frequent` memo 与 `visible` 分支。

---

## 6. 纯函数工具

### 6.1 url.ts

文件：[url.ts](../src/shared/url.ts)

| 函数 | 说明 |
| --- | --- |
| `normalizeUrl(raw)` | 已有协议原样返回；否则补 `https://` |
| `hostOf(raw)` | 提取 hostname 并去掉 `www.`；失败返回空串 |
| `looksLikeUrl(raw)` | 无空白 + 有协议 或 形如 `a.b`/`a.b/c` 的域名 |
| `subtitleFor(kind, target)` | 链接显示域名、文本显示字数、文件返回空串 |

### 6.2 format.ts

文件：[format.ts](../src/shared/format.ts)

```ts
prettyHotkey('CommandOrControl+Shift+Space')
// → 'Ctrl + Shift + Space'
```

替换顺序必须是 `CommandOrControl → Control → Super`，否则会得到 `CommandOrCtrl` 这类半截结果。

### 6.3 icons.ts

文件：[icons.ts](../src/shared/icons.ts)

```ts
REAL_ICON_EXTS = ['lnk', 'exe', 'url', 'ico']
hasRealIcon(ext): boolean
```

只有这四类值得向系统要图标；其余用 SVG。原因：普通文档/图片的系统图标都是白纸，而且逐个问 shell 会明显卡顿。

### 6.4 update.ts

文件：[update.ts](../src/shared/update.ts)

| 函数 | 说明 |
| --- | --- |
| `normalizeVersion(raw)` | 去掉 `v` 前缀与首尾空白 |
| `compareVersion(a, b)` | 语义化比较，返回 `1 / -1 / 0` |
| `isNewerVersion(latest, current)` | `compareVersion > 0` |
| `updateStatusText(state)` | 设置页与托盘共用的中文状态文案 |
| `updateNeedsAttention(status)` | `available` 或 `downloaded` |
| `updateBusy(status)` | `checking` 或 `downloading` |

版本比较细节：

- 数字段逐位比较，缺失补 0（解决 `0.6.10 < 0.6.9` 的字符串翻车）。
- 有预发布后缀的小于同版本正式版（`0.1.0-beta.1 < 0.1.0`）。
- 预发布段中纯数字按数字比，其余按字符串；数字标识优先级低于字母标识。

---

## 7. IPC 常量

文件：[types.ts](../src/shared/types.ts) 末尾的 `IPC` 对象是**通道名的唯一来源**，主进程与 preload 都引用它。

```ts
export const IPC = {
  stateGet: 'state:get',
  stateChanged: 'state:changed',
  itemAdd: 'item:add',
  itemAddPaths: 'item:add-paths',
  // ...
} as const
```

完整列表与语义见 [05-ipc-reference.md](./05-ipc-reference.md)。

> 注意：`actions.pushState()` 里直接写了字面量 `'state:changed'`，与 `IPC.stateChanged` 值一致但未引用常量；改动通道名时容易漏掉。

---

## 8. DeskboxApi 契约

文件：[api.ts](../src/shared/api.ts)

`DeskboxApi` 被两边共用：

- `preload/index.ts` 按它实现 `window.deskbox`；
- 渲染层按它调用，类型自动对齐。

分组：

| 分组 | 方法 |
| --- | --- |
| 状态 | `getState`、`onStateChanged` |
| 条目 | `addItem`、`addPaths`、`updateItem`、`removeItem`、`openItem`、`revealItem`、`copyItem` |
| 批量 | `updateItems`、`removeItems`、`openItems`、`reorderItems` |
| 菜单/拖拽 | `showItemMenu`、`showBatchMenu`、`startDrag` |
| 分组 | `addGroup`、`renameGroup`、`removeGroup`、`reorderGroups` |
| 设置 | `patchSettings` |
| 对话框 | `pickFiles`、`pickFolder` |
| 系统 | `readClipboard`、`openExternal`、`getPathForFile` |
| 数据 | `exportData`、`importData` |
| 窗口 | `hideWindow`、`togglePin` |
| 图标 | `getItemIcon` |
| 更新 | `getUpdate`、`checkUpdate`、`downloadUpdate`、`installUpdate`、`openUpdatePage`、`onUpdateChanged` |

下一步阅读：[05-ipc-reference.md](./05-ipc-reference.md)。
