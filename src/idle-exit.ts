/** Exit after `graceMs` with no `/events` clients. HTTP/healthz do not renew. */

export type IdleExitHooks = {
  graceMs: number
  onIdle: () => void
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

export type IdleExit = {
  start: () => void
  clientEnter: () => void
  clientLeave: () => void
  dispose: () => void
  readonly clientCount: number
}

export function createIdleExit(hooks: IdleExitHooks): IdleExit {
  const setT = hooks.setTimeout ?? setTimeout
  const clearT = hooks.clearTimeout ?? clearTimeout
  let clients = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const clearTimer = () => {
    if (timer === null) return
    clearT(timer)
    timer = null
  }

  const arm = () => {
    if (disposed) return
    clearTimer()
    if (clients > 0) return
    timer = setT(() => {
      timer = null
      if (disposed || clients > 0) return
      hooks.onIdle()
    }, hooks.graceMs)
  }

  return {
    start: arm,
    clientEnter() {
      if (disposed) return
      clients++
      clearTimer()
    },
    clientLeave() {
      if (disposed) return
      clients = Math.max(0, clients - 1)
      if (clients === 0) arm()
    },
    dispose() {
      disposed = true
      clearTimer()
    },
    get clientCount() {
      return clients
    },
  }
}
