/** @jsxImportSource hono/jsx */
import path from 'node:path'

export type RepoBarProps = {
  root: string
  recents: string[]
}

export function RepoBar(props: RepoBarProps) {
  const base = path.basename(props.root)
  const others = props.recents.filter((p) => path.resolve(p) !== path.resolve(props.root))

  return (
    <div id="repo-bar" class="repo-bar">
      <details class="repo-bar-details">
        <summary class="repo-bar-summary" title={props.root}>
          {base}
        </summary>
        <div class="repo-popover">
          <div class="repo-popover-path">{props.root}</div>
          {others.length > 0 ? (
            <div class="repo-recents">
              <div class="repo-recents-label">recent</div>
              <ul class="repo-recents-list">
                {others.map((p) => (
                  <li>
                    <button
                      type="button"
                      class="repo-recent-btn"
                      title={p}
                      hx-post={`/api/launch?path=${encodeURIComponent(p)}`}
                      hx-swap="none"
                    >
                      {path.basename(p)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <form
            class="repo-open-form"
            hx-post="/api/launch"
            hx-swap="none"
          >
            <input
              type="text"
              name="path"
              class="repo-open-input"
              placeholder="/path/to/repo"
              autocomplete="off"
            />
            <button type="submit" class="repo-open-submit">
              open
            </button>
          </form>
        </div>
      </details>
    </div>
  )
}
