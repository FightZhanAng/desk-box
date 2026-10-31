import { app } from 'electron'
import { join } from 'node:path'

/**
 * 资源目录。
 * 开发态在项目根的 resources/，打包后被 electron-builder 的 extraResources
 * 放到 process.resourcesPath/assets/。两条路径必须都覆盖，否则打包版找不到托盘图标。
 */
export function resourcesDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'assets') : join(app.getAppPath(), 'resources')
}

export function trayIconPath(): string {
  return join(resourcesDir(), 'tray', 'tray.png')
}

export function appIconPath(): string {
  return join(resourcesDir(), 'icon.png')
}
