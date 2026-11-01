# 桌面收纳盒 (desk-box)

一个常驻托盘的悬浮小抽屉。把桌面上的文件、文件夹、浏览器里的链接、随手一段文字拖进去，按分组收好，双击即开。

Electron 43 + React 19 + TypeScript，`electron-vite` 构建，Windows / macOS 都能打。

仓库：<https://github.com/FightZhanAng/desk-box>

---

## 它能干什么

| 场景 | 做法 |
| --- | --- |
| 桌面太乱，常用的几个文件懒得每次翻目录 | 把文件拖进盒子，双击直接打开 |
| 一堆「等会儿要处理」的东西 | 拖进「待处理」分组，处理完右键移除（**只移除记录，不动磁盘上的文件**） |
| 复制来的链接、命令、草稿 | 点底部「链接 / 片段」，或直接拖进来 |
| 想让盒子一直浮在桌面角落 | 点标题栏的图钉，或设置里开「窗口始终置顶」 |
| 嫌配色太素 / 面板太实 | 设置页换四套主题之一，拖滑块调面板不透明度 |
| 不想每次都找窗口 | `Ctrl + Shift + Space` 全局呼出；托盘图标左键也一样 |

### 收纳项的其他操作

- **双击** 打开（文件/文件夹用系统默认程序，链接用默认浏览器，文本复制到剪贴板）
- **右键** 弹出菜单：在文件夹中显示、复制路径、固定到最前、移动到其他分组、从盒子移除
- **拖出**：文件类条目可以直接从盒子里拖到资源管理器或其他程序
- **搜索**：`Ctrl + F` 聚焦，匹配名称、路径和内容
- **显示名**：快捷方式不带 `.lnk` 后缀（和桌面一致），其他扩展名照常保留；手动改过的名字不会被覆盖

### 分组

默认三个分组（待处理 / 工作 / 工具）。点 `+` 新建，双击分组名重命名，右键分组可删除（里面的条目会自动落到第一个分组，不会丢）。

### 外观

设置页里可以换四套配色，都是同一套变量的不同取值，切换即时生效：

| 主题 | 基调 |
| --- | --- |
| 暖木 | 米白纸 + 胡桃木橙（默认） |
| 夜墨 | 深灰纸 + 琥珀强调 |
| 青瓷 | 淡青绿纸 + 苔绿强调 |
| 靛蓝 | 深蓝纸 + 月白强调 |

面板不透明度可在 **78% – 100%** 之间调。下限卡在 78% 是因为这个窗口是常驻悬浮窗，再透一点深色字压在壁纸上就读不清了。拖动时进度实时预览，松手才落盘。

图标分两套走：

**`.lnk` / `.exe` / `.url` / `.ico` 用程序自己的图标**。这类条目用户认的就是那个程序的标志，画个通用「窗口」等于没给信息。

这里有个坑：直接对 `.lnk` 取图标，拿到的是系统画的「白纸 + 蓝箭头」占位图，所有快捷方式长得一模一样。所以先用 `shell.readShortcutLink` 解析出它指向的图标文件**和索引**，再按那一对去取 —— 桌面图标就是由 `(IconLocation, 索引)` 决定的，只取路径会把索引丢掉（夸克网盘是 `quark.exe` 的第 8 个图标）。

取图标本身不走 `app.getFileIcon`，而是自己解 `.ico` 容器和 PE 资源（`src/main/win-icon.ts`）。原因是实测下来 shell 对很多程序都给不出正确图标：带 PNG 压缩帧的 exe 会给通用占位图，自定义 `.ico` 会给「图片文件」的白纸，而且它根本不支持指定索引。自己解就都能取对，PNG 帧和 DIB 帧（含 AND 掩码透明度）都处理。

几个边界情况的处理：
- **exe 里有几十个图标帧但一个 `GROUP_ICON` 都没写**（夸克网盘这种）：第 N 个图标是编译器私有排布，复现不出 Windows 的索引对应，此时退回主图标 —— 宁可给对得上的品牌 logo，也不给一个不相干的图。
- **系统资源库**（`shell32.dll`、`imageres.dll`）：里面没有 ICON 资源，图标由系统内部映射，只能交回 shell。
- **解析不出来**（少见格式 / 资源损坏）时才退回 `app.getFileIcon`；同目录的 `.ico`（同名 → `icon.ico` / `app.ico` → `resources/` 下的 → 目录里唯一那个）作为最后的兜底。

**其余类型一律画矢量图**：统一的「纸张 + 折角」底形压一个白色类型标记（图片 / 文档 / 表格 / 代码 / 压缩包 / 媒体 / 程序），文件夹是「背板 + 前片」两层同色的立体造型。系统给普通文档/图片的图标本身就是一张白纸，不如自己画的；而且几十个文件逐个问 shell 会肉眼可见地卡。

图标按路径缓存，主进程一层（上限 300 条）渲染层一层，搜索、切分组都不会重复取。

### 更新

走 `electron-updater` + GitHub Release，不架自己的更新服务器：

- 设置页「更新」里有当前版本、检查结果、下载进度条，一个按钮随状态切换：检查更新 → 下载更新 → 重启安装
- 启动 6 秒后后台查一次，之后每 6 小时一次（托盘常驻，不会重启进程）。两个开关：「自动检查新版本」「自动下载」；关掉自动下载后，发现新版本只提示，等你点
- 只有装好的包才有更新可谈。开发态（`pnpm dev` / `pnpm preview`）和便携版（portable）会显示「当前形态不支持应用内更新」，按钮变成「发布页」
- 更新源是 `github.com/FightZhanAng/desk-box` 的 Release，地址由 `electron-builder.yml` 的 `publish` 段写进包里的 `app-update.yml`。本地 `pnpm dist` 固定 `--publish never`，上传只由 CI 干

---

## 开发

```bash
pnpm install
pnpm dev          # 开发模式（HMR）
pnpm typecheck    # 两侧 tsconfig 分别检查
pnpm build        # 产出 out/
pnpm preview      # 跑构建产物
```

打包（需要下载 electron-builder 的二进制，`scripts/dist.mjs` 已内置 npmmirror 镜像）：

```bash
pnpm dist -- --win      # NSIS 安装包 + 便携版
pnpm dist -- --mac      # dmg（未签名）
```

发一版（推 tag 触发 CI，本地不用打包）：

```bash
pnpm version patch --no-git-tag-version   # 或者手改 package.json
git commit -am "chore: bump 0.2.1"
git tag v0.2.1
git push origin main --tags
```

[`.github/workflows/release.yml`](.github/workflows/release.yml) 接到 tag 后：`pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm dist` → 把 `*-setup.exe`、`*-portable.exe`、`latest.yml`、`*.blockmap` 一起丢进 GitHub Release。`latest.yml` 和 `.blockmap` 是更新链路的一半，缺了客户端比不出新版本、也没法差量下载。

图标是脚本生成的，改了图形后重跑：

```bash
pnpm gen:icons
ICON_PREVIEW=1 pnpm gen:icons   # 额外产出 16/24/32/48 的放大预览，用来查小尺寸可读性
```

---

## 目录结构

```
src/
  main/            主进程
    index.ts       应用生命周期、单实例
    window.ts      无边框透明窗口、位置持久化、失焦收起
    tray.ts        托盘图标与菜单
    hotkey.ts      全局快捷键注册
    actions.ts     业务动作（增删改、打开、菜单、导入导出、系统图标）
    updater.ts     自动更新（electron-updater 单例）
    ipc.ts         IPC 通道
    store.ts       JSON 持久化（防抖 + 原子写）
    paths.ts       资源路径（开发态 / 打包态）
  preload/         contextBridge 桥接
  renderer/        React 界面
  shared/          两端共用的类型与纯函数
    icons.ts       哪些扩展名值得问系统要图标
    update.ts      版本号比较、更新状态文案（无依赖纯函数）
.github/
  workflows/release.yml   tag → 打包 → 传 Release
scripts/
  gen-icons.mjs    纯 Node 生成 png / ico / icns / 托盘图标
  electron-run.mjs 清掉 ELECTRON_RUN_AS_NODE 再启动
  dist.mjs         注入镜像后调 electron-builder
resources/         图标资源
```

---

## 数据在哪

`%APPDATA%/desk-box/desk-box.json`（开发态用 `--user-data-dir` 指定的目录）。

- 写入走「先写 `.tmp` 再 rename」的原子替换，中途崩溃不会留下半个 JSON
- 文件损坏时会改名成 `desk-box.json.broken-<时间戳>` 再重建默认数据，不会直接覆盖
- 设置面板里可以导出/恢复 JSON 备份

## 已知边界

- 只收**路径**，不搬文件。你把源文件挪走或删掉，卡片会显示「路径失效」并变成红色虚线框
- 托盘图标是固定的中性色，不跟随系统深浅色主题自动切换
- `launchAtLogin` 在便携版（portable）下系统可能不支持，静默失败
- macOS 包未签名，首次打开需要过 Gatekeeper
- 图标只缓存到进程退出为止。给某个 exe 换了图标要重启盒子才看得到
- 便携版和未打包态没有应用内更新，只能去 Release 页手动下
