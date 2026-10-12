export interface TerminalScope {
  serverId: string
  sessionId: string | null
  directory?: string
}

export function terminalScopeKey(scope: TerminalScope): string {
  // A chat keeps its terminals when its working directory changes.
  return JSON.stringify([scope.serverId, scope.sessionId, scope.sessionId ? null : (scope.directory ?? null)])
}
