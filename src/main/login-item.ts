import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 开机自启动开关。
 *
 * 两个坑：
 * 1. 便携版：electron-builder 的 portable 产物会先把应用解压到临时目录再运行，退出即清理。
 *    此时 `process.execPath` 指向那个临时目录里的 exe，直接注册会得到一个开机时已被删除的路径。
 *    便携版注入的 `PORTABLE_EXECUTABLE_FILE` 才是用户手里那个真实 exe。
 * 2. 开发模式：未打包时 `process.execPath` 是 node_modules 里的 electron.exe，只调
 *    `setLoginItemSettings({ openAtLogin: true })`，注册表 Run 键里只有一个裸的 electron.exe ——
 *    开机后弹出 Electron 默认欢迎页。所以要把应用目录塞进参数里，等价于 `electron.exe <项目根>`。
 *    但登录项拉起时没有 electron-vite 注入的 ELECTRON_RENDERER_URL（见 window.ts），
 *    窗口只能读 out/renderer/index.html；没构建过就没有页面，与其开机弹个空窗口，不如不注册。
 */
export function applyLaunchAtLogin(enabled: boolean): void {
  try {
    if (app.isPackaged) {
      const portableExe = process.env['PORTABLE_EXECUTABLE_FILE']
      app.setLoginItemSettings(
        portableExe ? { openAtLogin: enabled, path: portableExe } : { openAtLogin: enabled }
      )
      return
    }

    const builtRenderer = join(app.getAppPath(), 'out', 'renderer', 'index.html')
    const shouldRegister = enabled && existsSync(builtRenderer)
    app.setLoginItemSettings({
      openAtLogin: shouldRegister,
      path: process.execPath,
      args: [app.getAppPath()]
    })
  } catch {
    /* 无权限环境不支持，静默失败即可 */
  }
}
