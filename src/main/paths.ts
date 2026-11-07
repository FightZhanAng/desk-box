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
  // Windows 走 .ico：Electron 会把文件路径交给 LoadImage(IMAGE_ICON, SM_CXSMICON)，
  // 由系统按当前 DPI（100% → 16px，150% → 24px）挑最接近的那一档，1:1 出图。
  // 喂 png 则是「位图直接转 HICON」，尺寸沿用位图自己，任务栏再拉伸 —— 必糊。
  const name = process.platform === 'win32' ? 'tray.ico' : 'tray.png'
  return join(resourcesDir(), 'tray', name)
}

export function appIconPath(): string {
  return join(resourcesDir(), 'icon.png')
}
