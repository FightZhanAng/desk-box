# 08 · 开发指南

本文面向修改 desk-box 的开发者：约定、扩展配方、已知边界与排障。

---

## 1. 先建立心智模型

```text
渲染层（React）
   │  window.deskbox（唯一系统入口）
   ▼
预加载（contextBridge，纯转发）
   │  IPC
   ▼
主进程 ipc.ts（withState 包装）
   │
   ▼
actions.ts（业务规则、内存修改、推送）
   │
   ▼
store.ts（防抖 + 原子写 JSON）
```

记住三句话：

1. **改数据的代码只在主进程**。
2. **每次写操作都要返回/推送完整 `AppState`**。
3. **共享层保持纯净**（无 electron、无 react）。

---

## 2. 编码约定

### 2.1 分层约定

| 层 | 可以做 | 不要做 |
| --- | --- | --- |
| `src/shared` | 类型、常量、纯函数 | import electron/react、读写文件 |
| `src/main` | 系统调用、业务规则、持久化 | 直接操作 DOM、返回 JSX |
| `src/preload` | IPC 包装、`contextBridge` | 业务判断、直接改数据 |
| `src/renderer` | UI、派生数据、交互 | `require`、`fs`、绕过 `window.deskbox` |

### 2.2 主进程约定

- 所有导出动作先 `getData()`，改内存，再 `save(data)`。
- 批量动作只 `save` 一次、只 `buildState` 一次。
- 会弹原生 UI（对话框/菜单）时必须 `lockAutoHide()`，并在 `finally`/`callback` 释放。
- 对外抛错用中文、面向用户；`withState` 会把它变成 `ok:false`。
- 用户取消返回 `{ cancelled: true }`，不要当成失败。
- 新增写操作后，若走的是托盘/菜单等非 IPC 入口，记得 `pushState()`。

### 2.3 渲染层约定

- 所有派生数据用 `useMemo`，不要写进 `state`。
- 拖拽相关状态用 `useRef` 镜像，因为 `dragstart → drop → dragend` 在同一 tick 完成。
- 选中集合永远与「当前可见」取交集后再批量操作。
- 卡片/分组的内部拖拽必须用自定义 MIME（`lib/dnd.ts`）。
- 新增浮层注意 `Esc` 的传播顺序（`TextPeek` 用捕获阶段 `stopPropagation`）。

### 2.4 注释约定

这个仓库的注释偏“解释为什么”，而不是“解释做什么”。新增复杂逻辑时优先写清楚：

- 为什么不能用显而易见的写法（例如 `app.getFileIcon('.lnk')` 为什么不行）；
- 这个兜底是为了防什么真实故障；
- 数值/阈值的来源（如 `ICON_SIZE=64`、`OPACITY_MIN=0.78`）。

---

## 3. 扩展配方

### 3.1 新增一个收纳项字段

1. `shared/types.ts` 的 `Item` 加字段（落盘）或 `ItemView`（派生）。
2. `shared/defaults.ts` 的 `normalizeData` 增加校验与默认值；老数据要能平滑迁移。
3. `actions.ts` 的 `addItem` 初始化该字段，`applyItemPatch` 如需可编辑则加白名单。
4. `buildState()` 若为派生字段，在这里计算。
5. 渲染层展示/编辑。
6. 更新 [04-shared-data-model.md](./04-shared-data-model.md)。

注意：`applyItemPatch` 是**字段白名单**，不加进去的字段批量更新会被静默忽略。

### 3.2 新增一个 IPC 通道

见 [05-ipc-reference.md §5](./05-ipc-reference.md#5-新增通道的标准步骤)。顺序是：

```text
types.ts → api.ts → preload/index.ts → main/ipc.ts → main/actions.ts → 文档
```

### 3.3 新增一种文件类型图标

1. `renderer/src/components/ItemGlyph.tsx` 的 `EXT_KINDS` 加扩展名映射。
2. 如需新标记形状，在 `Mark` 中加分支。
3. 若还想取系统图标，改 `shared/icons.ts` 的 `REAL_ICON_EXTS`（谨慎：会增加 shell 调用）。

### 3.4 新增排序方式

1. `shared/types.ts` 的 `ItemSort` 联合类型加值。
2. `shared/defaults.ts` 的 `SORT_IDS` / `SORT_LABELS` 加条目（顺序即菜单顺序）。
3. `renderer/src/lib/sortItems.ts` 加比较逻辑。
4. `normalizeData` 会自动把非法值回退到默认，无需额外处理。

### 3.5 新增主题

1. `shared/types.ts` 的 `ThemeId` 加值。
2. `shared/defaults.ts` 的 `THEME_IDS` / `THEME_LABELS` 加条目。
3. `renderer/src/styles.css` 增加 `.shell[data-theme='<id>']` 变量块。
4. 检查对比度：正文、次级文字、强调色、失效红、成功绿。

### 3.6 新增主进程副作用设置

1. `Settings` 加字段 + `DEFAULT_SETTINGS` 默认值。
2. `normalizeData` 做类型校验（非法值回默认）。
3. `actions.patchSettings` 加副作用调用。
4. 设置页加控件。
5. 如果托盘菜单也展示该状态，改 `tray.ts` 的 `refreshTrayMenu` 并在变更后调用。

### 3.7 新增托盘菜单项

1. `tray.ts` 的 `refreshTrayMenu` 增加 `MenuItemConstructorOptions`。
2. 调用 `actions` 或 `window` 的动作后，必须 `pushState()` / `refreshTrayMenu()`。
3. 若会弹对话框，记得 `lockAutoHide`。

---

## 4. 关键不变式（改动前确认）

| 不变式 | 破坏后果 |
| --- | --- |
| `shared` 不引用 electron/react | 另一侧 tsconfig 编译失败 |
| 主进程与 preload 产物为 CJS | 启动报具名导出错误 |
| `electron` 被外部化 | 打包后 `Electron failed to install correctly` |
| 落盘数据通过 `normalizeData` | 老数据/手工编辑的 JSON 会让应用崩溃或字段丢失 |
| 排序时 `pinned` 优先 | “固定”失效，用户找不到钉住的条目 |
| 新条目 `order = min - 1` | 批量拖入时位次冲突、顺序抖动 |
| 写操作返回完整 `AppState` | 界面状态不同步 |
| 路径失效由 `exists` 派生 | 死链无法提示，打开时报错不明确 |
| 内部拖拽必须被 `suppressDrop` 排除 | 拖分组会收纳成一条文本，拖卡片会触发文件导入 |
| 对话框期间锁自动隐藏 | 窗口先隐藏，对话框悬空或直接取消 |
| 退出前 `flushNow` + `flushBounds` | 最后一步操作/窗口位置丢失 |

---

## 5. 调试手册

### 5.1 界面白屏 / 窗口不可见

| 检查 | 方法 |
| --- | --- |
| 主进程是否启动 | 终端是否有编译输出 |
| 环境变量 | 是否存在 `ELECTRON_RUN_AS_NODE`、`NODE_OPTIONS` |
| 渲染层 URL | dev 下 `ELECTRON_RENDERER_URL` 是否可达 |
| 透明窗 reveal | 是否有 1200ms 兜底；看 DevTools 是否可开 |
| CSP | 控制台是否有 `Refused to ...` |

### 5.2 数据异常

| 现象 | 排查 |
| --- | --- |
| 启动为空 | 检查 `desk-box.json` 是否损坏；看是否有 `.broken-*` |
| 条目跑到别的分组 | `normalizeData` 会把孤儿条目落到 `groups[0]`；检查 `groupId` |
| 手动排序无效 | 查看 `order` 是否都为 0；`reorderItems` 会重编号 |
| 重复拖入不新增 | 符合预期：同 `target` 只移动分组并提示“已存在” |
| 路径失效 | 源文件被移动/删除；应用只存路径不搬文件 |

### 5.3 图标问题

见 [06-icon-subsystem.md §6](./06-icon-subsystem.md#6-图标常见问题与排查)。

### 5.4 更新不生效

| 检查 | 说明 |
| --- | --- |
| 是否安装版 | 开发态/便携版不支持应用内更新 |
| `app-update.yml` | 打包产物里应存在（由 `publish` 段生成） |
| Release 资产 | 必须包含 `latest.yml` 与 blockmap |
| 版本号 | `latest.yml` 的版本要大于 `package.json` 当前版本 |
| 自动检查开关 | 设置页是否关闭 |
| 状态文案 | `UpdateState.message` / `updateStatusText` 会给出原因 |

### 5.5 托盘勾选不同步

改动设置后没有调用 `refreshTrayMenu()`。检查 `settings:patch` 与 `win:toggle-pin` 两条路径。

---

## 6. 已验证的边界与限制

来自 README 与实现：

| 限制 | 说明 |
| --- | --- |
| 只收路径，不搬文件 | 源文件移动/删除 → 显示“路径失效”红色虚线 |
| 托盘图标固定 | 不跟随系统深浅色 |
| 开发态自启 | 需要 `out/renderer` 构建产物，否则不注册（避免开机空窗口） |
| 便携版自启 | 用 `PORTABLE_EXECUTABLE_FILE` 注册真实 exe，不能用临时解压路径 |
| macOS 未签名 | 首次需过 Gatekeeper |
| 图标缓存进程级 | 换 exe 图标需重启 |
| 便携版/开发态无更新 | 只能打开发布页 |
| 图标无 GROUP_ICON 的 exe | 无法复现 Windows 私有索引，退回主图标 |
| `.dll` 图标 | 系统资源库无 ICON 资源，交给 shell |
| 资源 ID 为负的 IconLocation | 归 0，无法解析 |
| 文本批量打开 | 跳过（“打开”= 复制，连点只剩最后一条） |
| 「常用」不可整理 | 顺序按打开次数现算 |

---

## 7. 变更检查清单

提交前：

- [ ] `pnpm typecheck` 通过（两侧都过）
- [ ] `pnpm dev` 手动验证主流程：拖入、打开、搜索、分组、排序、批量、设置
- [ ] 涉及主进程：托盘菜单状态、失焦收起、退出落盘
- [ ] 涉及数据：老 JSON 能正常加载（可用导出/导入回归）
- [ ] 涉及图标：快捷方式/普通文件/失效路径/文件夹四种卡片都看一眼
- [ ] 涉及更新：开发态显示“不支持”且按钮为“发布页”
- [ ] 涉及 IPC：preload 与主进程签名一致，取消路径不报错
- [ ] 文档同步：本 Wiki 对应章节已更新

---

## 8. 术语表

| 术语 | 含义 |
| --- | --- |
| 条目（Item） | 收纳项，四类：file/folder/link/text |
| 分组（Group） | 条目的分类容器，至少保留一个 |
| 常用（freq） | 虚拟分组，按打开次数聚合，不落盘 |
| 座位算法 | 手动排序时把条目填回它们原本占住的位置 |
| `ItemView` | 落盘 `Item` + `ext`/`exists`/`linkDir` 派生字段 |
| `ActionResult` | 写操作统一返回：成功标记 + 提示 + 取消 + 最新状态 |
| 通用占位图 | 系统给无图标资源 exe 画的白纸图，用哈希识别 |
| 孤儿帧 | 未被 `GROUP_ICON` 引用的 `RT_ICON` 资源 |
| Panel alpha | 面板不透明度，78%–100% |

---

## 9. 推荐阅读顺序

1. [README.md](./README.md) —— 项目定位与导航
2. [01-architecture.md](./01-architecture.md) —— 进程、数据流、设计决策
3. [04-shared-data-model.md](./04-shared-data-model.md) —— 先懂数据
4. [02-main-process.md](./02-main-process.md) —— 再懂业务
5. [03-renderer.md](./03-renderer.md) —— 最后看界面
6. [05-ipc-reference.md](./05-ipc-reference.md) / [06-icon-subsystem.md](./06-icon-subsystem.md) —— 按需查阅
7. [07-build-release.md](./07-build-release.md) —— 要发布时看
