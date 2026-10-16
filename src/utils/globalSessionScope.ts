// ============================================
// 「全局」会话作用域
//
// 侧栏「全局」不是这台机器上的全部会话。v2 的 session.list 在不传
// directory 时会跨目录返回；这里把「全局」收成服务器默认工作目录
// （location.get() 不带 directory 的 directory，桌面端即用户主目录，
// 也就是 opencode 的启动目录）。
//
// 这个策略集中在本文件，方便以后和上游同步时一眼看出分叉点：
// 上游曾在全局点击时 addDirectory 切走工作区，本仓库不要跟回去。
// ============================================

import { isSameDirectory, normalizeToForwardSlash } from './directoryUtils'

export interface GlobalScopePath {
  directory?: string
}

/** 服务器默认工作目录。空路径不当成「不过滤」。 */
export function globalScopeDirectory(pathInfo: GlobalScopePath | null | undefined): string | undefined {
  const directory = normalizeToForwardSlash(pathInfo?.directory)
  return directory || undefined
}

/**
 * 会话列表要传给 session.list 的目录。
 * 选中某个项目时用该项目；「全局」（currentDirectory 为空）用主目录。
 * 主目录还没拿到时返回 undefined，调用方必须先别拉列表，否则会混进所有目录。
 */
export function sessionListDirectory(
  currentDirectory: string | undefined,
  pathInfo: GlobalScopePath | null | undefined,
): string | undefined {
  const current = normalizeToForwardSlash(currentDirectory)
  if (current) return current
  return globalScopeDirectory(pathInfo)
}

/**
 * 打开会话时要写进路由的目录。
 *
 * - 已经在某个项目里：沿用会话自己的目录（和以前一样，可能因此换项目）。
 * - 正在「全局」：会话就在主目录时不要写 dir，选择器保持「全局」。
 *   其它目录（活跃 tab、搜索、别的文件夹）仍然切过去。
 * - 主目录还未知：无法判断是不是主目录会话，保持原有「写上会话目录」行为。
 */
export function directoryForSessionOpen(
  routeDirectory: string | undefined,
  sessionDirectory: string | undefined,
  globalDirectory: string | undefined,
): string | undefined {
  if (routeDirectory) return sessionDirectory
  if (sessionDirectory && globalDirectory && isSameDirectory(sessionDirectory, globalDirectory)) {
    return undefined
  }
  return sessionDirectory
}

/** 这条会话是否属于当前列表作用域（全局 = 主目录）。作用域未知时不算匹配。 */
export function sessionMatchesListScope(
  sessionDirectory: string | undefined,
  currentDirectory: string | undefined,
  pathInfo: GlobalScopePath | null | undefined,
): boolean {
  const scope = sessionListDirectory(currentDirectory, pathInfo)
  if (!scope || !sessionDirectory) return false
  return isSameDirectory(scope, sessionDirectory)
}
