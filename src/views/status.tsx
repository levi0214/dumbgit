/** @jsxImportSource hono/jsx */

/**
 * Out-of-band fragment so endpoints can update #status alongside another swap.
 *
 * Feedback model:
 *   - info: ephemeral. The real UI already changed elsewhere; this is just a
 *     receipt. Auto-dismisses after a short delay (driven by the client via
 *     `data-auto-dismiss`).
 *   - error: sticky. The user may need to read or copy the message. A close
 *     button (and Esc) dismisses it.
 *   - empty: no inner; the slot collapses to zero height (CSS).
 */
export function StatusOob(props: { error?: string; info?: string }) {
  if (props.error) {
    return (
      <div id="status" class="status-slot" hx-swap-oob="true">
        <div class="status-inner status-error" role="alert">
          <pre class="status-text">{props.error}</pre>
          <button
            type="button"
            class="status-close"
            aria-label="dismiss"
            title="dismiss (Esc)"
          >
            ×
          </button>
        </div>
      </div>
    )
  }
  if (props.info) {
    return (
      <div id="status" class="status-slot" hx-swap-oob="true">
        <div
          class="status-inner status-info"
          role="status"
          data-auto-dismiss="3500"
        >
          <pre class="status-text">{props.info}</pre>
          <button
            type="button"
            class="status-close"
            aria-label="dismiss"
            title="dismiss (Esc)"
          >
            ×
          </button>
        </div>
      </div>
    )
  }
  return <div id="status" class="status-slot" hx-swap-oob="true"></div>
}
