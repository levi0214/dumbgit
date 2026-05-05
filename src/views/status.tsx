/** @jsxImportSource hono/jsx */

/** Out-of-band fragment so endpoints can update #status alongside another swap. */
export function StatusOob(props: { error?: string; info?: string }) {
  if (props.error) {
    return (
      <div id="status" class="status-slot" hx-swap-oob="true">
        <pre class="status-inner status-error">{props.error}</pre>
      </div>
    )
  }
  if (props.info) {
    return (
      <div id="status" class="status-slot" hx-swap-oob="true">
        <pre class="status-inner status-info">{props.info}</pre>
      </div>
    )
  }
  return <div id="status" class="status-slot" hx-swap-oob="true"></div>
}
