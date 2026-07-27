/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'

const COPY_ICO = raw(
  `<svg class="copy-ico" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
)
const CHECK_ICO = raw(
  `<svg class="check-ico" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
)

export function CopyButton(props: { value?: string; title?: string }) {
  return (
    <button
      type="button"
      class="copy-btn"
      data-copy={props.value}
      title={props.title ?? 'copy'}
    >
      {COPY_ICO}
      {CHECK_ICO}
    </button>
  )
}
