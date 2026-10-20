// ============================================
// 未保存文件的全局脏标记 + 关闭协商
// ============================================
//
// 编辑中的文件是否有未保存改动，需要被"关标签页 / 关窗 / 离开"这类全局动作知道，
// 单靠组件内部状态无法问。这里存一个 id 集合，由编辑中的文件视图登记。
//
// 关闭协商：面板标签栏的关闭按钮在 store 层（不知道草稿内容），
// 由编辑中的文件视图登记一个"关之前先问我"的处理器。

const dirtyEditors = new Set<string>()

/** editorId → 关闭前先问一句的处理器 */
const closeHandlers = new Map<string, () => void>()

/** 脏状态变化时通知订阅方（标签栏上的 ● 标记要跟着变） */
const dirtyListeners = new Set<() => void>()

/** 编辑器身份：服务器 + 工作区目录 + 相对路径（不同服务器的同名文件是不同编辑器） */
export function fileEditorId(serverId: string | undefined, directory: string | undefined, path: string): string {
  return `${serverId ?? ''}::${directory ?? ''}::${path}`
}

export function setFileEditorDirty(editorId: string, dirty: boolean): void {
  if (dirty) {
    if (dirtyEditors.has(editorId)) return
    dirtyEditors.add(editorId)
  } else {
    if (!dirtyEditors.has(editorId)) return
    dirtyEditors.delete(editorId)
  }
  dirtyListeners.forEach(fn => fn())
}

export function hasUnsavedFileChanges(): boolean {
  return dirtyEditors.size > 0
}

/** 某个编辑器当前是否有未保存改动 */
export function isFileEditorDirty(editorId: string): boolean {
  return dirtyEditors.has(editorId)
}

/** 订阅脏状态变化 */
export function subscribeFileEditorDirty(listener: () => void): () => void {
  dirtyListeners.add(listener)
  return () => {
    dirtyListeners.delete(listener)
  }
}

/** 登记"关闭前先问我"的处理器；返回注销函数 */
export function registerFileEditorCloseHandler(editorId: string, handler: () => void): () => void {
  closeHandlers.set(editorId, handler)
  return () => {
    if (closeHandlers.get(editorId) === handler) closeHandlers.delete(editorId)
  }
}

/**
 * 请求关闭某个编辑器。
 * @returns true = 已有处理器接管（可能弹了确认）；false = 没人管，调用方直接关
 */
export function requestCloseFileEditor(editorId: string): boolean {
  const handler = closeHandlers.get(editorId)
  if (!handler) return false
  handler()
  return true
}
