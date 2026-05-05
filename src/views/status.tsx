/** Out-of-band fragment: pair with a #graph swap so errors land in #status. */
export function StatusOob(props: { stderr?: string }) {
  if (props.stderr) {
    return (
      <div id="status" class="status-slot" hx-swap-oob="true">
        <pre class="status-inner">{props.stderr}</pre>
      </div>
    )
  }
  return <div id="status" class="status-slot" hx-swap-oob="true"></div>
}
