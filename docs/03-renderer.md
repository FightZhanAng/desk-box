# 03 · 渲染层（React）

渲染层位于 [src/renderer](../src/renderer)，是纯 React 19 应用，不直接访问 Node/Electron，全部系统能力通过 `window.deskbox`（见 [05-ipc-reference.md](./05-ipc-reference.md)）。

## 0. 文件结构

```text
src/renderer/
├─ index.html                CSP、#root
└─ src/
   ├─ main.tsx               createRoot 挂载
   ├─ App.tsx                状态中心 + 交互编排（约 650 行）
   ├─ styles.css             1900 行，四套主题 + 全部样式
   ├─ global.d.ts            声明 window.deskbox
   ├─ lib/
   │  ├─ sortItems.ts        分组内二次排序
   │  ├─ initials.ts         拼音首字母 + 缓存
   │  └─ dnd.ts              内部拖拽 MIME 常量与判定
   └─ components/            13 个组件 + 1 个 hook + 1 个图标库
```

## 1. 启动与类型

`main.tsx`：

```tsx
const container = document.getElementById('root')
if (!container) throw new Error('找不到挂载节点 #root')
createRoot(container).render(<App />)
```

`global.d.ts` 把 `window.deskbox` 声明为 `DeskboxApi`，保证渲染层调用与 preload 实现共用同一份签名。

---

## 2. App.tsx —— 应用状态中心

文件：[App.tsx](../src/renderer/src/App.tsx)

### 2.1 本地状态一览

| 状态 | 类型 | 用途 |
| --- | --- | --- |
| `state` | `AppState \| null` | 来自主进程的完整数据 |
| `groupId` | `string \| null` | 当前分组；`freq` 表示「常用」 |
| `query` | `string` | 搜索关键词 |
| `sheet` | `'none' \| 'link' \| 'text'` | 新增链接/片段弹层 |
| `settingsOpen` | `boolean` | 设置页替换主界面 |
| `selectedIds` | `string[]` | 多选集合 |
| `anchorId`（ref） | `string \| null` | Shift 连选起点 |
| `toast` | `{text, tone, seq} \| null` | 底部提示；`seq` 用于重新触发动画 |
| `dragging` | `boolean` | 外部拖入时的全屏投放层 |
| `alphaPreview` | `number \| null` | 拖动透明度滑块时的临时预览 |
| `update` | `UpdateState \| null` | 更新状态 |
| `arranging` | `boolean` | 整理模式（拖拽只排序，不拖出文件） |
| `internalDrag`（ref） | `boolean` | 卡片是否正在内部拖拽 |
| `groupDrag`（ref） | `boolean` | 分组胶囊是否正在换位 |
| `dragDepth`（ref） | `number` | dragenter/dragleave 计数，避免子元素抖动 |

### 2.2 状态同步

```tsx
useEffect(() => {
  window.deskbox.getState().then(setState)
  return window.deskbox.onStateChanged(setState)  // 返回取消订阅
}, [])
```

更新状态单独订阅 `getUpdate()` + `onUpdateChanged`。

### 2.3 派生数据

| 派生值 | 计算方式 |
| --- | --- |
| `groups` | `state.groups` |
| `activeGroup` | `freq` 或现存分组 id，否则 `null`（全部） |
| `frequent` | `openCount > 0`，按 `openCount` 降序、`lastOpenedAt` 降序，取前 10 |
| `visible` | 先按分组过滤，再按关键词匹配（title/target/note + 拼音首字母），最后按 `sortBy` 排序 |
| `selectedVisible` | `selectedIds ∩ visible`，保证批量操作只作用于当前看得见的条目 |
| `counts` | 每个分组的条目数 |
| `peekItem` | 当前预览的文本片段 |

搜索匹配细节：

```ts
item.title.toLowerCase().includes(keyword) ||
item.target.toLowerCase().includes(keyword) ||
item.note.toLowerCase().includes(keyword) ||
(initialsMode && initialsOf(item.title).includes(keyword))
```

- `initialsMode` 仅在关键词为纯字母/数字时启用。
- 首字母只作用于 **名称**，不作用于路径（否则噪音会盖过结果）。
- 「常用」分组不做二次排序，直接使用 `frequent` 的顺序并过滤。

### 2.4 动作封装

| 回调 | 行为 |
| --- | --- |
| `notify(result)` | `setState(result.state)`；有 `message` 时弹 toast（`ok`/`warn`） |
| `run(task)` | 调用 API，异常时弹“操作没成功” |
| `patchSettings(patch)` | 发设置 IPC |
| `changeSort(sortBy)` | 非 `custom` 时退出整理模式 |
| `toggleArrange()` | 「常用」下拒绝；进入时自动切到 `custom` |
| `reorderVisible(ids)` | 提交手动顺序 |
| `openItem(id)` | 打开单条 |
| `selectItem(id, event)` | Ctrl/Meta 切换、Shift 连选、普通单击不选中 |
| `showItemMenu(id)` | 先清空选择，再发单条菜单 |
| `openSelected/pinSelected/moveSelected/removeSelected` | 批量动作，只作用于 `selectedVisible` |
| `hideWindow` | 收进托盘 |
| `runUpdateAction(action)` | 更新检查/下载/安装/发布页 |

### 2.5 选择模型

| 操作 | 结果 |
| --- | --- |
| 普通单击 | 不选中（单选动作走右键菜单） |
| `Ctrl/Cmd` 点击 | 切换该条；反选锚点时把锚点移到剩余最后一项 |
| `Shift` 点击 | 从锚点到当前项的可见区间连选；可叠加 Ctrl |
| 右键 | 清空选择，只操作被点的那一条 |
| 点击空白 `.board` | 清空选择 |
| `Ctrl+A` | 选中当前可见全部（输入框内不生效） |
| `Delete` | 批量移除（有确认框） |
| `Esc` | 依次关闭设置 / 新增弹层 / 清空选择 |
| `Ctrl+F` | 聚焦并全选搜索框 |

多选后底部出现 [SelectionBar](../src/renderer/src/components/SelectionBar.tsx)，批量操作统一从这里走。

### 2.6 拖放逻辑

页面级 `onDragEnter / onDragOver / onDragLeave / onDrop` 处理“从外部拖东西进来”。

内部拖拽必须被识别并排除，否则拖分组胶囊会凭空产生一条 `target` 为分组 id 的文本片段。

判定方式：

```ts
isInternalDrag(types) =
  types.includes('application/x-deskbox-item') ||
  types.includes('application/x-deskbox-group')
```

为什么不用“拖拽标志位”：目标元素的 `onDrop` 先执行并清掉标志，事件冒泡到 shell 时标志已是 false；`types` 在整条链路里始终有效。

`suppressDrop` 的条件：

```ts
arranging || internalDrag.current || groupDrag.current || isInternalDragType(event)
```

外部投放优先级：

1. `dataTransfer.files` → `getPathForFile()` 批量 `addPaths`
2. `text/uri-list` → 收纳为链接
3. `text/plain` → `looksLikeUrl()` 判定链接/文本

投放到「常用」虚拟分组时，一律落到第一个真实分组。

### 2.7 渲染结构

```text
.shell(data-theme / --panel-alpha / 拖放事件)
├─ SettingsPanel            （settingsOpen 时替换整页）
└─ 主界面
   ├─ TitleBar              置顶 / 设置 / 隐藏
   ├─ GroupTabs             全部 / 常用 / 分组胶囊 / 更多 / 新建
   ├─ SearchBar + SortMenu  搜索框与排序入口
   ├─ .arrange-hint         整理模式提示与「完成」
   ├─ .board
   │  ├─ EmptyState         空态 / 无搜索结果
   │  └─ ItemGrid → ItemCard
   ├─ SelectionBar          多选操作条
   └─ Dock                  文件 / 文件夹 / 链接 / 片段 / 计数

浮层：
├─ .dropzone              外部拖入提示
├─ AddSheet                新增链接/片段
├─ TextPeek                片段预览
└─ .toast                  操作回执
```

设置页采用“替换整页”而不是浮层：拖动透明度滑块时，面板本身就在半透明纸上，改动当场可见。

---

## 3. 组件说明

### 3.1 TitleBar

文件：[TitleBar.tsx](../src/renderer/src/components/TitleBar.tsx)

| Prop | 说明 |
| --- | --- |
| `pinned` | 是否始终置顶 |
| `total` | 条目总数 |
| `hotkey` | 实际生效的快捷键 |
| `onTogglePin` / `onOpenSettings` / `onHide` | 动作 |

显示 `N 项`（或“还空着”）与 `prettyHotkey` 可读化的快捷键。

### 3.2 GroupTabs

文件：[GroupTabs.tsx](../src/renderer/src/components/GroupTabs.tsx)，最复杂的组件。

| 功能 | 实现 |
| --- | --- |
| 自适应收纳 | `useLayoutEffect` 逐个量胶囊宽度，放不下的加 `is-hidden`（绝对定位 + visibility，仍可测量），收进「更多 N」 |
| 窗口缩放重算 | `ResizeObserver` → `tick()` 递增 `layoutEpoch` |
| 活动分组保障 | 当前分组若被藏起，强制换到可见集合，必要时继续丢尾部 |
| 新建分组 | `+` → 输入框 → Enter 提交 / Esc 取消 |
| 重命名 | 双击胶囊 → 定宽输入框 → Enter/失焦提交 |
| 拖拽换位 | 自定义 MIME `application/x-deskbox-group`；`dragRef` 镜像实时值 |
| 右键菜单 | 重命名 / 左移 / 右移 / 删除分组 |
| 「更多」下拉 | 按按钮实测位置定位；点外部或 Esc 关闭；触发按钮与面板都要豁免 |
| 置位回调 | `onDragStateChange(true/false)` 让 App 屏蔽外部投放 |

计数规则：`counts.get(id)` 大于 0 才显示；「全部」显示总数；「常用」显示 `frequentCount`，为 0 时不渲染该胶囊。

### 3.3 SearchBar 与 SortMenu

- [SearchBar.tsx](../src/renderer/src/components/SearchBar.tsx)：受控输入 + 清空按钮 + `trailing` 插槽。
- [SortMenu.tsx](../src/renderer/src/components/SortMenu.tsx)：按钮弹出排序菜单，项来自 `SORT_IDS` / `SORT_LABELS`（最近添加 / 最近打开 / 按名称 / 手动整理），另有「拖拽调整顺序 / 结束拖拽整理」独立项。

### 3.4 ItemGrid 与 ItemCard

文件：[ItemGrid.tsx](../src/renderer/src/components/ItemGrid.tsx)、[ItemCard.tsx](../src/renderer/src/components/ItemCard.tsx)

`ItemGrid` 负责整理模式下的实时预览排序：

| 状态/Ref | 用途 |
| --- | --- |
| `draft` / `draftRef` | 拖动中的临时顺序（只含可拖动项） |
| `dragId` / `dragRef` | 正在拖的卡片 |
| `beginDrag` | 记录当前非固定项顺序 |
| `hover` | 把拖动项 splice 到目标位置 |
| `finish` | 松手才调用 `onReorder(draft)`，然后清空草稿 |

使用 ref 镜像的原因是 `dragstart → dragover → drop → dragend` 会在同一 tick 派发完，React 状态尚未提交。

`ItemCard` 的关键行为：

| 条件 | 行为 |
| --- | --- |
| 普通模式 + 文件/文件夹 | `draggable=true`，`dragstart` 时 `preventDefault()` 并调用 `window.deskbox.startDrag(id)` |
| 普通模式 + 链接/文本 | 不可拖出 |
| 整理模式 + 非固定项 | HTML5 原生拖拽排序，写入内部 MIME + `text/plain` |
| 整理模式 + 固定项 | 不可拖，tooltip 说明“已固定，不参与排序” |
| 双击文本 | 打开 `TextPeek` 预览 |
| 双击其他 | `openItem` |
| 右键 | 单条原生菜单 |
| 路径失效 | `is-missing` 红色虚线样式；`meta` 显示“路径失效” |

`metaOf` 副标题：链接显示域名、文本显示字数、文件夹显示“文件夹”、文件显示大写扩展名。

### 3.5 ItemGlyph 与 useRealIcon

- [ItemGlyph.tsx](../src/renderer/src/components/ItemGlyph.tsx)：纯 SVG 图标系统。
  - 链接：按 `target` 哈希选色块 + 域名首字母。
  - 文本：引号色块。
  - 文件：纸张 + 折角 + 类型标记（image/doc/sheet/code/archive/media/app/file）。
  - 文件夹：背板 + 前片双层造型。
  - 文件夹快捷方式：矢量文件夹 + 左下角“捷径”小圆徽。
  - 失效路径：虚线轮廓 + 感叹号。
- [useRealIcon.ts](../src/renderer/src/components/useRealIcon.ts)：模块级缓存 `Map<target, url|null>`。
  - 仅当 `exists && !linkDir && kind 是 file/folder && hasRealIcon(ext)` 时才请求主进程。
  - 同一个 target 在整个渲染进程生命周期内只请求一次。

### 3.6 SelectionBar

文件：[SelectionBar.tsx](../src/renderer/src/components/SelectionBar.tsx)

| 动作 | 说明 |
| --- | --- |
| 打开 | 批量打开，文本会跳过 |
| 固定 / 取消固定 | 全部已固定时显示“取消固定” |
| 移动 | 下拉列出其他分组；当前分组排除 |
| 移除 | 批量移除，主进程弹确认 |
| 全选 | 仅当 `count < total` 时出现 |
| 关闭 | `Esc` 同效 |

独立于 Dock：Dock 常驻用于“收纳新东西”，SelectionBar 是临时状态配临时界面。

### 3.7 Dock

文件：[Dock.tsx](../src/renderer/src/components/Dock.tsx)

四个入口：文件、文件夹、链接、片段；右侧显示 `visible / total`（相等时只显示总数）。

### 3.8 AddSheet

文件：[AddSheet.tsx](../src/renderer/src/components/AddSheet.tsx)

| 模式 | 输入 | 提交 |
| --- | --- | --- |
| `link` | 单行 URL 输入 | Enter |
| `text` | 多行 textarea | Ctrl/Cmd + Enter |

Esc、遮罩点击、取消按钮均可关闭。

### 3.9 TextPeek

文件：[TextPeek.tsx](../src/renderer/src/components/TextPeek.tsx)

- 只读预览片段全文，显示字数/行数。
- 捕获阶段监听 Esc 并 `stopPropagation()`，避免 App 的 Esc 同时清空选择。
- 「复制全文」用 `navigator.clipboard.writeText`，成功后按钮变成“已复制”。

### 3.10 SettingsPanel

文件：[SettingsPanel.tsx](../src/renderer/src/components/SettingsPanel.tsx)

分区：

| 分区 | 内容 |
| --- | --- |
| 外观 | 四套主题卡片、卡片密度（舒展/紧凑）、不透明度滑块（78%–100%） |
| 行为 | 窗口置顶、失焦收起、开机自启、呼出快捷键录制 |
| 更新 | 版本卡片（状态文案 + 进度条 + 主按钮）、自动检查、自动下载 |
| 数据 | 导出备份、从备份恢复 |

两个内部组件：

- `Row`：名称 + 描述 + 控件。
- `Switch`：布尔开关。
- `UpdateCard`：根据状态切换按钮：检查中/下载中（禁用）、重启安装、下载更新、发布页、检查更新。

快捷键录制规则：

- 必须包含至少一个修饰键（Ctrl/Alt/Shift/Super），否则忽略。
- 单个修饰键按下不提交。
- `normalizeKey` 把 `ArrowUp → Up`、`Enter → Return`、`Space` 等转成 Electron accelerator 写法。
- 输出 `Control+Shift+Space` 形式。

不透明度滑块的三个细节：

1. 拖动中只更新 `draftOpacity` 与 `alphaPreview`，**松手才落盘**。
2. `committed` ref 保存“上一次已发出”的值，避免连续提交时因 `settings.opacity` 还是旧值而丢弃第二次。
3. 卸载时 `onOpacityPreview(null)`，防止 App 永久停留在过期预览值。

### 3.11 EmptyState 与图标库

- [EmptyState.tsx](../src/renderer/src/components/EmptyState.tsx)：搜索无结果 / 空盒子两种文案，空态提供四个快捷入口。
- [icons.tsx](../src/renderer/src/components/icons.tsx)：全部手写 SVG，统一 24 栅格、1.6 描边；包含 Drawer/Pin/Gear/Minus/Plus/Search/Close/FilePlus/Link/Text/Folder/ArrowDown/Sort/Arrange/EmptyDrawer。

---

## 4. lib 工具

### 4.1 sortItems.ts

文件：[sortItems.ts](../src/renderer/src/lib/sortItems.ts)

| `sortBy` | 比较规则 |
| --- | --- |
| `custom` | 原样返回（主进程已按 order 排好） |
| `name` | `拼音首字母 + 小写标题` 的 `localeCompare('zh-Hans-CN')`，再按 `createdAt` 倒序 |
| `opened` | `lastOpenedAt` 降序；从未打开过的（0）自然排在后面，再按 `createdAt` |
| `recent` | `createdAt` 降序 |

所有模式都先比较 `pinned`，固定项恒在最前。

### 4.2 initials.ts

文件：[initials.ts](../src/renderer/src/lib/initials.ts)

- 使用 `pinyin-pro` 的 `pattern: 'first'`，转小写并仅保留 `[a-z0-9]`。
- 结果按原文缓存，上限 4000 条；达到上限直接 `clear()`。
- 拼音库抛错时退化为原串小写字母数字。
- `isInitialsQuery` 仅对纯 `[a-z0-9]+` 的查询启用，避免中文串也走首字母。

### 4.3 dnd.ts

文件：[dnd.ts](../src/renderer/src/lib/dnd.ts)

```ts
export const INTERNAL_ITEM_TYPE = 'application/x-deskbox-item'
export const INTERNAL_GROUP_TYPE = 'application/x-deskbox-group'
export function isInternalDrag(types: readonly string[]): boolean
```

单独成模块是为了避免 `App → GroupTabs → App` 的循环依赖。

---

## 5. 样式系统

文件：[styles.css](../src/renderer/src/styles.css)（约 1900 行）

### 主题

`:root` 保存「暖木」默认变量；四套主题通过 `.shell[data-theme='...']` 覆盖：

| 主题 id | 名称 | 基调 |
| --- | --- | --- |
| `wood` | 暖木 | 米白纸 + 胡桃木橙（默认） |
| `night` | 夜墨 | 深灰纸 + 琥珀强调 |
| `celadon` | 青瓷 | 淡青绿纸 + 苔绿强调 |
| `indigo` | 靛蓝 | 深蓝纸 + 月白强调 |

核心变量分组：

| 前缀 | 用途 |
| --- | --- |
| `--paper*` / `--veil` / `--grain` | 纸面底色与纹理 |
| `--ink*` | 三级文字色 |
| `--line*` / `--hair*` / `--surface*` | 线与面 |
| `--accent*` / `--on-accent` / `--mark` | 强调色 |
| `--ok` / `--warn*` | 成功/警告 |
| `--shadow` / `--scrim` / `--toast-*` | 阴影、遮罩、提示 |
| `--k-*` | 文件类型图标色 |
| `--tile-min` / `--tile-gap` | 网格尺寸 |
| `--radius-*` | 圆角 |

### 不透明度

App 在 `.shell` 上写入 `--panel-alpha`（`alphaPreview ?? settings.opacity`），面板背景使用该变量。  
下限 0.78 的原因：再透一点，深色字压 wallpaper 上读不清，而这是常驻悬浮窗。

### 布局

- `.shell`：全屏透明容器 + `::before` 绘制圆角纸面与投影。
- `.board`、`.grid`：滚动容器与响应式网格（`--tile-min`）。
- `.grid.is-compact`：紧凑密度。
- 浮层（`.ctx` / `.sortmenu` / `.group-menu`）使用绝对定位 + 视口边界夹紧。
- `.toast` 通过 `key={seq}` 重新挂载以重播入场动画。

---

## 6. 渲染层扩展建议

| 想做什么 | 修改点 |
| --- | --- |
| 新增卡片操作 | `SelectionBar` + `App` 的回调 + 主进程 `actions` + IPC |
| 新增排序方式 | `shared/types.ts` 的 `ItemSort`、`defaults.ts` 的 `SORT_IDS` / `SORT_LABELS`、`lib/sortItems.ts` |
| 新增主题 | `ThemeId`、`THEME_IDS` / `THEME_LABELS`、`styles.css` 的 `[data-theme]` 块 |
| 新增文件类型图标 | `ItemGlyph.tsx` 的 `EXT_KINDS` 与 `Mark` |
| 新增搜索维度 | `App.tsx` 的 `matches` |
| 调整分组收纳 | `GroupTabs` 的 `useLayoutEffect` 预算计算 |

下一步阅读：[04-shared-data-model.md](./04-shared-data-model.md)。
