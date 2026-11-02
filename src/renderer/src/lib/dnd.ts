/**
 * 界面内部拖拽用的自定义 MIME 类型。
 *
 * 只在应用内部流转，外部程序不会产生这两个类型 —— 用它区分「我在拖自己的
 * 卡片 / 分组」和「用户从桌面拖了文件进来」，比拖拽标志位可靠得多：
 * 目标元素的 onDrop 先于 shell 执行，标志位到冒泡时已经被清掉了。
 *
 * 单独放一个模块而不是挂在 App 里，是为了避免组件反过来 import App 形成
 * 循环依赖（App → GroupTabs → App）。
 */
export const INTERNAL_ITEM_TYPE = 'application/x-deskbox-item'
export const INTERNAL_GROUP_TYPE = 'application/x-deskbox-group'

/** 这次拖拽是否来自界面内部（卡片排序或分组换位） */
export function isInternalDrag(types: readonly string[]): boolean {
  return types.includes(INTERNAL_ITEM_TYPE) || types.includes(INTERNAL_GROUP_TYPE)
}
