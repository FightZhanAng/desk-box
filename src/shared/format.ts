/** 展示用格式化。主进程与渲染层共用，不允许依赖 electron / react。 */

/**
 * 把 Electron 的 accelerator 写法转成人读的样式。
 * 先替换 CommandOrControl 再替换 Control，否则会得到 "CommandOrCtrl" 这种半截结果。
 */
export function prettyHotkey(raw: string): string {
  return raw
    .replace(/CommandOrControl/gi, 'Ctrl')
    .replace(/Control/gi, 'Ctrl')
    .replace(/Super/gi, 'Win')
    .replace(/\+/g, ' + ')
}
