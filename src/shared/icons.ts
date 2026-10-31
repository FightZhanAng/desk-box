/**
 * 哪些文件该用「系统原图标」，哪些用自绘矢量图。
 *
 * 只挑图标本身带信息量的几类：
 *   lnk  快捷方式 —— 用户认的就是它指向的那个程序，画个通用「窗口」等于没信息
 *   exe  可执行文件 —— 同上
 *   url  网页快捷方式 —— 带浏览器图标，一眼能看出是什么程序
 *   ico  图标文件本身
 *
 * 图片、文档这些相反：系统给的是千篇一律的白纸，还不如按类型画的矢量图清楚，
 * 而且几十个文件一起取系统图标会明显卡（每次都要问一遍 shell）。
 */
export const REAL_ICON_EXTS = ['lnk', 'exe', 'url', 'ico']

export function hasRealIcon(ext: string): boolean {
  return REAL_ICON_EXTS.includes(ext.toLowerCase())
}
