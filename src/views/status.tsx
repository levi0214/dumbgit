/** @jsxImportSource hono/jsx */

/**
 * Out-of-band fragment for the top status slot.
 *
 * Feedback model: the screen is the receipt. When an action mutates state, the
 * affected UI region (graph row, worktree panel, diff panel) updates and that
 * IS the success signal — no narration needed. Only failures get a bar, and
 * they stick until the user dismisses them with × or Esc.
 *
 *   - error: sticky bar, manually dismissed.
 *   - empty: slot collapses (CSS `:empty { margin: 0 }`).
 */
export function StatusOob(props: { error?: string }) {
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
  return <div id="status" class="status-slot" hx-swap-oob="true"></div>
}
