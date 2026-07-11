import { describe, expect, test } from 'bun:test'
import { createIdleExit } from '../src/idle-exit'

function fakeTimers() {
  let nextId = 1
  const pending = new Map<number, { fn: () => void; at: number }>()
  let now = 0

  const setTimeoutFn = ((fn: () => void, ms: number) => {
    const id = nextId++
    pending.set(id, { fn, at: now + ms })
    return id as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout

  const clearTimeoutFn = ((id: ReturnType<typeof setTimeout>) => {
    pending.delete(id as unknown as number)
  }) as typeof clearTimeout

  const advance = (ms: number) => {
    now += ms
    const due = [...pending.entries()]
      .filter(([, t]) => t.at <= now)
      .sort((a, b) => a[1].at - b[1].at)
    for (const [id, t] of due) {
      if (!pending.has(id)) continue
      pending.delete(id)
      t.fn()
    }
  }

  return { setTimeoutFn, clearTimeoutFn, advance }
}

describe('createIdleExit', () => {
  test('exits after grace with no clients', () => {
    const t = fakeTimers()
    let idle = 0
    const ie = createIdleExit({
      graceMs: 1000,
      onIdle: () => {
        idle++
      },
      setTimeout: t.setTimeoutFn,
      clearTimeout: t.clearTimeoutFn,
    })
    ie.start()
    expect(idle).toBe(0)
    t.advance(999)
    expect(idle).toBe(0)
    t.advance(1)
    expect(idle).toBe(1)
  })

  test('client connection cancels boot grace; leave re-arms', () => {
    const t = fakeTimers()
    let idle = 0
    const ie = createIdleExit({
      graceMs: 500,
      onIdle: () => {
        idle++
      },
      setTimeout: t.setTimeoutFn,
      clearTimeout: t.clearTimeoutFn,
    })
    ie.start()
    t.advance(400)
    ie.clientEnter()
    t.advance(500)
    expect(idle).toBe(0)
    ie.clientLeave()
    t.advance(499)
    expect(idle).toBe(0)
    t.advance(1)
    expect(idle).toBe(1)
  })

  test('stays alive while any SSE client remains', () => {
    const t = fakeTimers()
    let idle = 0
    const ie = createIdleExit({
      graceMs: 200,
      onIdle: () => {
        idle++
      },
      setTimeout: t.setTimeoutFn,
      clearTimeout: t.clearTimeoutFn,
    })
    ie.start()
    ie.clientEnter()
    ie.clientEnter()
    ie.clientLeave()
    t.advance(1000)
    expect(idle).toBe(0)
    expect(ie.clientCount).toBe(1)
    ie.clientLeave()
    t.advance(200)
    expect(idle).toBe(1)
  })

  test('dispose prevents later idle exit', () => {
    const t = fakeTimers()
    let idle = 0
    const ie = createIdleExit({
      graceMs: 100,
      onIdle: () => {
        idle++
      },
      setTimeout: t.setTimeoutFn,
      clearTimeout: t.clearTimeoutFn,
    })
    ie.start()
    ie.dispose()
    t.advance(500)
    expect(idle).toBe(0)
    ie.clientEnter()
    ie.clientLeave()
    t.advance(500)
    expect(idle).toBe(0)
  })
})
