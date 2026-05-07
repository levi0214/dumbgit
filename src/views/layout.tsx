/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'

const CSS = `
:root {
  --bg: #1e1e1e;
  --fg: #e8e8e8;
  --muted: #686868;
  --accent: #569cd6;
  --graph-rail-muted: #484848;
  --border: #333;
  --error: #f48771;
  --success: #6a9955;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 13px;
  line-height: 1.45;
  background: var(--bg);
  color: var(--fg);
}
.page {
  max-width: 1700px;
  margin: 0 auto;
  padding: 12px 16px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.repo-bar {
  flex-shrink: 0;
  margin: 0;
}
.repo-bar-details {
  position: relative;
  display: inline-block;
}
.repo-bar-summary {
  list-style: none;
  cursor: pointer;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  font-weight: 700;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
}
.repo-bar-summary::-webkit-details-marker {
  display: none;
}
.repo-bar-summary::after {
  content: ' ▾';
  font-size: 9px;
  color: var(--muted);
  font-weight: 400;
  margin-left: 5px;
}
.repo-bar-summary:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
  color: var(--accent);
}
.repo-bar-details[open] .repo-bar-summary {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(86, 156, 214, 0.45);
  color: var(--accent);
}
.repo-bar-details[open] .repo-bar-summary::after {
  color: var(--accent);
}
.repo-popover {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  z-index: 20;
  min-width: 320px;
  max-width: min(90vw, 520px);
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #252526;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.repo-popover-path {
  font-size: 11px;
  color: var(--muted);
  word-break: break-all;
  margin-bottom: 8px;
}
.repo-recents {
  margin: 0 -12px 10px;
}
.repo-recents-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 4px;
  padding: 0 12px;
}
.repo-recents-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.repo-recents-list li {
  margin: 0;
}
.repo-recents-list li + li {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.repo-recent-btn {
  all: unset;
  appearance: none;
  cursor: pointer;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 16px;
  min-height: 40px;
  font: inherit;
  font-size: 13px;
  line-height: 1.35;
  color: var(--accent);
  text-align: left;
}
.repo-recent-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  color: #7ebef0;
}
.repo-recent-btn:active {
  background: rgba(255, 255, 255, 0.13);
}
.repo-recent-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  background: rgba(255, 255, 255, 0.07);
}
.repo-open-form {
  display: flex;
  gap: 6px;
  align-items: center;
}
.repo-open-input {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 12px;
  padding: 8px 10px;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #1e1e1e;
  color: var(--fg);
  box-sizing: border-box;
}
.repo-open-submit {
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 8px 14px;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #2d2d2d;
  color: var(--fg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.repo-open-submit:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.head-back-btn {
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #2d2d2d;
  color: var(--fg);
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.head-back-btn {
  margin-left: 0;
  border-color: rgba(224, 162, 58, 0.6);
  color: #ffd58a;
}
.head-back-btn:hover {
  background: rgba(224, 162, 58, 0.18);
  border-color: #e0a23a;
  color: #ffd58a;
}
.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.graph-root {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: auto;
  background: #252526;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.graph-root.graph-error {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.graph-root.graph-error .msg {
  margin: 0;
  white-space: pre-wrap;
  color: var(--error);
}
.graph-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: #2d2d30;
  color: var(--accent);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
}
.graph-head .repo-bar {
  padding-right: 12px;
  margin-right: 2px;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
}
.graph-head-line {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.graph-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}
.graph-head-detached {
  background: rgba(224, 162, 58, 0.14);
  border-bottom-color: rgba(224, 162, 58, 0.45);
}
.graph-head-detached .head-prep {
  color: #e0a23a;
}
.graph-head-detached .head-label {
  color: #ffd58a;
}
.head-prep {
  color: var(--muted);
  font-size: 12px;
}
.head-label {
  font-weight: 700;
  color: #ffffff;
}
.worktree-panel {
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  background: #252526;
}
.worktree-clean-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 8px;
}
.wt-clean-stash-slot {
  margin-left: auto;
}
.worktree-clean {
  color: var(--muted);
}
.worktree-body {
  padding: 0 12px 8px;
}
.wt-stash-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  margin-bottom: 4px;
}
.wt-stash-bar-label {
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.wt-stash-btn {
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #2d2d2d;
  color: var(--fg);
  white-space: nowrap;
}
.wt-stash-btn:hover {
  background: rgba(86, 156, 214, 0.12);
  border-color: var(--accent);
  color: var(--accent);
}
.wt-section {
  margin-top: 6px;
}
.wt-section-title {
  color: var(--accent);
  margin-bottom: 2px;
}
.wt-count {
  color: var(--muted);
}
.wt-list {
  margin: 0;
  padding: 0 0 0 6px;
  list-style: none;
}
.wt-list li {
  display: flex;
  gap: 6px;
  min-width: 0;
}
.wt-file-btn {
  font: inherit;
  border: none;
  background: transparent;
  padding: 2px 6px;
  margin: 0 -6px;
  cursor: pointer;
  text-align: left;
  flex: 1;
  min-width: 0;
  color: inherit;
  display: flex;
  align-items: baseline;
  gap: 6px;
  border-left: 2px solid transparent;
  border-radius: 3px;
}
.wt-mark {
  display: inline-block;
  width: 1.5em;
  flex-shrink: 0;
  color: var(--muted);
}
.wt-file-btn .wt-path {
  word-break: break-all;
  color: var(--fg);
  flex: 1;
  min-width: 0;
}
.wt-file-btn:hover .wt-path {
  color: var(--accent);
}
.wt-file-btn.wt-file-selected {
  background: rgba(86, 156, 214, 0.18);
  border-left-color: var(--accent);
  box-shadow: inset 0 0 0 1px rgba(86, 156, 214, 0.28);
}
.wt-file-btn.wt-file-selected .wt-path {
  color: var(--accent);
  font-weight: 700;
}
.graph-body {
  flex: 0 0 auto;
  min-height: 0;
  display: block;
}
.graph-load-more {
  flex-shrink: 0;
  width: 100%;
  margin: 0;
  padding: 7px 12px;
  border: none;
  border-top: 1px solid var(--border);
  border-radius: 0;
  font: inherit;
  font-size: 11px;
  line-height: 1.35;
  cursor: pointer;
  background: transparent;
  color: var(--muted);
  display: block;
  text-align: center;
  box-sizing: border-box;
}
.graph-load-more:hover {
  background: rgba(255, 255, 255, 0.045);
  color: var(--accent);
}
.log-lines {
  margin: 0;
  padding: 8px 0;
  overflow: visible;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.32;
  color: var(--fg);
}
.log-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  border-left: 2px solid transparent;
  overflow: visible;
}
.log-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
/* HEAD row: no row color — the ● dot + bold weight already signal "you are here".
   A neutral left strip just anchors the eye without overloading any color's meaning. */
.log-row-head {
  border-left-color: rgba(255, 255, 255, 0.18);
  font-weight: 600;
}
.log-row-detached {
  border-left-color: #e0a23a !important;
  background: rgba(224, 162, 58, 0.09) !important;
}
.log-row-detached .branch-prefix {
  background: rgba(224, 162, 58, 0.25) !important;
  color: #ffd58a !important;
}
/* HEAD marker: glow lives on the hollow ring only so the disk stays an opaque knockout. */
.graph-node-head {
  color: #3ddc6c;
  opacity: 1;
}
.graph-node-head .graph-node-head-ring {
  filter: drop-shadow(0 0 3px rgba(61, 220, 108, 0.65));
}
.graph-node-head-detached {
  color: #e0a23a;
}
.graph-node-head-detached .graph-node-head-ring {
  filter: drop-shadow(0 0 3px rgba(224, 162, 58, 0.65));
}
/* Viewing row: blue is the only "row color" in the log — it means "active focus",
   and visually pairs with the diff panel chrome on the right. */
.log-row-commit.log-row-viewing {
  box-shadow: inset 3px 0 0 0 var(--accent);
  background: rgba(86, 156, 214, 0.14);
}
.log-row-dim .msg-btn,
.log-row-dim .msg-age,
.log-row-dim .row-tail {
  opacity: 0.38;
}
.log-row-dim:hover .msg-btn,
.log-row-dim:hover .msg-age,
.log-row-dim:hover .row-tail {
  opacity: 0.85;
}
/* Reachability-off commits recede as a row, but branch anchors stay readable. */
.log-row-commit.log-row-dim .branch-prefix {
  color: var(--fg);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  opacity: 0.38;
}
.log-row-commit.log-row-dim .branch-prefix:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--fg);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
  opacity: 0.9;
}
.log-row-commit.log-row-dim .ref-pill-branch,
.log-row-commit.log-row-dim .ref-pill-head {
  color: var(--fg);
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  opacity: 0.38;
}
.log-row-commit.log-row-dim .ref-pill-remote {
  color: #b8b8b8;
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  opacity: 0.5;
}
.log-row-commit.log-row-dim .ref-pill:hover {
  border-color: rgba(255, 255, 255, 0.3);
  color: var(--fg);
  background: rgba(255, 255, 255, 0.1);
  opacity: 0.9;
}
.log-row-other {
  height: 0;
  min-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0;
  pointer-events: none;
  position: relative;
  z-index: 0;
}
.log-row-commit {
  position: relative;
  z-index: 1;
}
.graph-prefix {
  display: inline-flex;
  align-self: center;
  align-items: center;
  flex-shrink: 0;
  overflow: visible;
}
.graph-prefix-wide {
  display: inline-flex;
  align-self: center;
  align-items: center;
  overflow: visible;
}
.graph-lanes-svg {
  display: block;
  flex-shrink: 0;
  overflow: visible;
}
.graph-node {
  opacity: 1;
}
.graph-lane-fallback {
  fill: var(--graph-rail-muted);
  font: 600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
}
.graph-pills {
  display: inline-flex;
  flex-wrap: nowrap;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
}
.graph-pills:empty {
  display: none;
}
.ref-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font: inherit;
  font-size: 11px;
  line-height: 14px;
  cursor: pointer;
  padding: 1px 8px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #333;
  color: var(--fg);
  flex-shrink: 0;
  overflow: visible;
  white-space: nowrap;
}
.ref-pill:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.ref-pill-head {
  border-color: var(--accent);
  background: rgba(86, 156, 214, 0.15);
}
.ref-pill-branch {
  color: #9cdcfe;
}
/* Remote = outlined / ghost: deprioritized vs local. */
.ref-pill-remote {
  background: transparent;
  border-color: rgba(133, 133, 133, 0.45);
  color: var(--muted);
  opacity: 0.85;
}
.ref-pill-remote:hover {
  opacity: 1;
  border-color: var(--accent);
  color: var(--accent);
}
.branch-prefix {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  overflow: visible;
  white-space: nowrap;
  font-size: 12px;
  line-height: 16px;
  color: #9cdcfe;
  background: rgba(156, 220, 254, 0.12);
  border-radius: 3px;
  padding: 0 5px;
  cursor: pointer;
  user-select: none;
}
.row-action-btn {
  all: unset;
  cursor: pointer;
  font-size: 11px;
  line-height: 14px;
  color: var(--muted);
  border-radius: 3px;
  padding: 1px 5px;
}
.row-action-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--accent);
}
.inline-action-btn {
  all: unset;
  cursor: pointer;
  display: none;
  align-items: center;
  height: 14px;
  line-height: 14px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 700;
  color: #d7ecff;
  border-radius: 3px;
  background: rgba(86, 156, 214, 0.22);
}
.ref-pill:hover .inline-action-btn,
.branch-prefix:hover .inline-action-btn,
.head-label:hover .inline-action-btn {
  display: inline-flex;
}
.inline-action-btn:hover {
  color: #ffffff;
  background: rgba(86, 156, 214, 0.34);
}
.confirm-armed {
  color: #ffd58a !important;
  border-color: rgba(224, 162, 58, 0.6) !important;
  background: rgba(224, 162, 58, 0.18) !important;
}
.branch-prefix:hover {
  background: rgba(156, 220, 254, 0.22);
}
.log-row-head .branch-prefix {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.14);
}
/* Same grid cell: date by default, hash + copy on hover — no floating chip. */
.row-end {
  display: inline-grid;
  flex-shrink: 0;
  align-items: center;
  justify-items: end;
}
.msg-age,
.row-tail {
  grid-area: 1 / 1;
}
.msg-age {
  color: var(--muted);
  font-size: 11px;
  line-height: 16px;
}
.row-tags-marker {
  display: inline-flex;
  margin-left: 6px;
  color: #c89bd9;
  opacity: 0.95;
  vertical-align: -0.08em;
}
.row-tags-marker .tag-ico {
  display: block;
}
.log-row:hover .msg-age {
  visibility: hidden;
}
/* Out of layout until hover — visibility:hidden still reserved space and crushed the message. */
.row-tail {
  display: none;
  align-items: center;
  gap: 4px;
  height: 16px;
}
.log-row:hover .row-tail {
  display: inline-flex;
}
.hash-peek {
  font-family: inherit;
  font-size: 11px;
  color: var(--muted);
  user-select: all;
}
.copy-sha-btn {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px;
  border-radius: 3px;
  color: var(--muted);
  vertical-align: middle;
}
.copy-sha-btn:hover {
  color: var(--accent);
  background: rgba(255, 255, 255, 0.06);
}
.copy-ico {
  display: block;
}
.copy-sha-flash {
  color: var(--success) !important;
}
.msg-btn {
  font: inherit;
  border: none;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
  padding: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 0;
  min-width: 0;
}
.msg-btn:hover {
  color: var(--accent);
}
.log-lines.empty {
  color: var(--muted);
}
.status-slot {
  margin-bottom: 8px;
}
.status-inner {
  margin: 0;
  padding: 8px 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 12px;
}
.status-error {
  border: 1px solid var(--error);
  background: #3c2020;
  color: var(--error);
}
.status-info {
  border: 1px solid var(--success);
  background: #1f2d1f;
  color: var(--success);
}
.diff-panel {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #252526;
  overflow: auto;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.diff-empty {
  padding: 16px;
  color: var(--muted);
}
.diff-panel.diff-error .diff-body {
  color: var(--error);
}
/* Blue echo — visually pairs the diff panel with the viewing row on the left. */
.diff-panel.diff-summary {
  border-color: rgba(86, 156, 214, 0.42);
}
.diff-panel.diff-summary .diff-head {
  background: rgba(86, 156, 214, 0.12);
  border-bottom-color: rgba(86, 156, 214, 0.30);
}
.diff-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: #2d2d30;
}
.diff-subject {
  color: var(--accent);
  word-break: break-word;
}
.diff-meta {
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
}
.diff-tags {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.diff-tag {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  max-width: min(100%, 18rem);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  color: #d6bce8;
  background: rgba(200, 155, 217, 0.12);
}
.diff-tag .tag-ico {
  display: block;
  flex-shrink: 0;
}
.diff-tag-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diff-worktree-file .diff-head {
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.diff-worktree-file .diff-subject {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex: 1;
  color: var(--fg);
  font-weight: 600;
}
.worktree-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}
.worktree-action-btn {
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #2d2d2d;
  color: var(--fg);
  white-space: nowrap;
}
.worktree-action-btn:hover {
  background: rgba(86, 156, 214, 0.12);
  border-color: var(--accent);
  color: var(--accent);
}
.diff-subject-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.diff-hunk-compact {
  color: var(--muted);
  font-weight: 400;
  font-style: italic;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}
.diff-hunk-compact.diff-hunk-first {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
.diff-files-block {
  border-bottom: 1px solid var(--border);
  outline: none;
}
.diff-files-head {
  padding: 6px 12px 2px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.diff-files-count {
  font-weight: normal;
  opacity: 0.85;
}
.diff-files-empty {
  padding: 8px 12px 12px;
  color: var(--muted);
  font-size: 12px;
}
.diff-patch-slot {
  flex: 0 0 auto;
  min-height: 0;
  padding: 0;
  display: block;
  background: #1f1f1f;
}
.diff-patch-slot:not(:empty) {
  padding: 10px 12px 12px;
  border-top: 1px solid var(--border);
}
.diff-patch-pre {
  margin: 0 !important;
  padding: 10px 0 0 !important;
  flex: 0 0 auto;
  min-height: 0;
  overflow: visible !important;
}
.diff-patch-error {
  color: var(--error) !important;
  white-space: pre-wrap !important;
}
.diff-patch-empty {
  color: var(--muted) !important;
}
.diff-files {
  margin: 0;
  padding: 8px 12px;
  list-style: none;
}
.diff-files li {
  display: flex;
}
.diff-file-btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  display: flex;
  gap: 8px;
  align-items: baseline;
  width: 100%;
  min-width: 0;
  padding: 3px 8px;
  margin: 0 -8px;
  border-left: 2px solid transparent;
  border-radius: 3px;
  color: inherit;
}
.diff-file-btn:hover .file-path {
  color: var(--accent);
}
.diff-file-btn.diff-file-selected {
  background: rgba(86, 156, 214, 0.2);
  border-left-color: var(--accent);
  box-shadow: inset 0 0 0 1px rgba(86, 156, 214, 0.35);
}
.diff-file-btn.diff-file-selected .file-path {
  color: var(--accent);
  font-weight: 700;
}
.diff-file-btn:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 2px;
}
.file-status {
  display: inline-block;
  width: 1.5em;
  flex-shrink: 0;
  color: var(--muted);
}
.file-A { color: var(--success); }
.file-D { color: var(--error); }
.file-M { color: #dcdcaa; }
.file-R { color: var(--accent); }
.file-path { word-break: break-all; flex: 1; min-width: 0; }
.file-num {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.file-num-add { color: #89d185; }
.file-num-del { color: #f48771; }
.file-num-new { color: var(--accent); }
.file-num-binary { color: var(--muted); font-style: italic; }
.diff-body {
  margin: 0;
  padding: 10px 12px;
  overflow: visible;
  white-space: pre;
  font-family: inherit;
  font-size: 12px;
  flex: 0 0 auto;
  min-height: 0;
}
.diff-add {
  display: block;
  color: #89d185;
  background: rgba(106, 153, 85, 0.12);
}
.diff-del {
  display: block;
  color: #f48771;
  background: rgba(244, 135, 113, 0.1);
}
.diff-hunk {
  display: block;
  color: var(--accent);
  font-weight: 600;
}
.diff-meta-line {
  display: block;
  color: var(--muted);
}
.diff-ctx {
  display: block;
}
`

const EMPTY_DIFF_HTML =
  '<div id="diff" class="diff-panel diff-empty">(click a commit message to see changed files)</div>'

const KEY_SCRIPT =
  `const EMPTY_DIFF = ${JSON.stringify(EMPTY_DIFF_HTML)};` +
  `
function syncViewingHighlight() {
  var inp = document.getElementById('viewing-sha');
  var sha = inp && inp.value ? String(inp.value).trim().toLowerCase() : '';
  document.querySelectorAll('.log-row-commit').forEach(function (row) {
    var ds = row.getAttribute('data-sha');
    var match = !!(sha && ds && ds.toLowerCase() === sha);
    row.classList.toggle('log-row-viewing', match);
  });
}

function clearSelectedFiles() {
  document.querySelectorAll('.diff-file-selected, .wt-file-selected').forEach(function (b) {
    b.classList.remove('diff-file-selected');
    b.classList.remove('wt-file-selected');
    b.removeAttribute('aria-current');
  });
}

function syncWorktreeFileSelection() {
  var diff = document.getElementById('diff');
  var kind = diff && diff.dataset ? diff.dataset.worktreeKind : '';
  var path = diff && diff.dataset ? diff.dataset.worktreePath : '';
  document.querySelectorAll('.wt-file-selected').forEach(function (b) {
    b.classList.remove('wt-file-selected');
    b.removeAttribute('aria-current');
  });
  if (!kind || !path) return;
  document.querySelectorAll('.wt-file-btn').forEach(function (btn) {
    var ds = btn.dataset || {};
    var match = ds.kind === kind && ds.path === path;
    btn.classList.toggle('wt-file-selected', match);
    if (match) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  });
}

function clearConfirmButton(btn) {
  var old = btn.getAttribute('data-confirm-original');
  if (old !== null) btn.textContent = old;
  btn.classList.remove('confirm-armed');
  btn.removeAttribute('data-confirm-armed');
  btn.removeAttribute('data-confirm-original');
  var timer = btn.getAttribute('data-confirm-timer');
  if (timer) clearTimeout(Number(timer));
  btn.removeAttribute('data-confirm-timer');
}

function clearOtherConfirmButtons(btn) {
  document.querySelectorAll('[data-confirm-armed="true"]').forEach(function (other) {
    if (other !== btn) clearConfirmButton(other);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  syncViewingHighlight();
  syncWorktreeFileSelection();
});

document.addEventListener('click', function (e) {
  var btn = e.target && e.target.closest && e.target.closest('[data-confirm-label]');
  if (!btn) {
    clearOtherConfirmButtons(null);
    return;
  }
  clearOtherConfirmButtons(btn);
  if (btn.getAttribute('data-confirm-armed') === 'true') {
    clearConfirmButton(btn);
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  btn.setAttribute('data-confirm-armed', 'true');
  btn.setAttribute('data-confirm-original', btn.textContent || '');
  btn.textContent = '✓ ' + (btn.getAttribute('data-confirm-label') || 'confirm');
  btn.classList.add('confirm-armed');
  var timer = setTimeout(function () { clearConfirmButton(btn); }, 3000);
  btn.setAttribute('data-confirm-timer', String(timer));
}, true);

document.body.addEventListener('htmx:beforeSwap', function (e) {
  var t = e.detail.target;
  if (!t || t.id !== 'worktree') return;
  var xhr = e.detail.xhr;
  if (!xhr || xhr.status !== 200) return;
  var url = xhr.responseURL || '';
  if (url.indexOf('/fragment/worktree') === -1) return;
  var bar = document.querySelector('.repo-bar-summary');
  var curRoot = bar ? String(bar.getAttribute('title') || '').trim() : '';
  if (!curRoot) return;
  try {
    var txt = xhr.responseText || '';
    var doc = new DOMParser().parseFromString(txt, 'text/html');
    var nw = doc.getElementById('worktree');
    var respRoot = nw ? String(nw.getAttribute('data-repo') || '').trim() : '';
    if (!respRoot) return;
    if (respRoot !== curRoot) {
      e.detail.shouldSwap = false;
    }
  } catch (err) {
    /* allow swap */
  }
});

document.body.addEventListener('htmx:afterSwap', function (e) {
  var t = e.detail && e.detail.target;
  if (!t || !t.id) return;
  if (t.id === 'diff' || t.id === 'graph') {
    syncViewingHighlight();
    syncWorktreeFileSelection();
  }
  if (t.id === 'worktree') syncWorktreeFileSelection();
});

document.addEventListener('click', function (e) {
  var fileBtn = e.target && e.target.closest && e.target.closest('.diff-file-btn, .wt-file-btn');
  if (!fileBtn) return;
  clearSelectedFiles();
  fileBtn.classList.add(fileBtn.matches('.wt-file-btn') ? 'wt-file-selected' : 'diff-file-selected');
  fileBtn.setAttribute('aria-current', 'true');
});

document.body.addEventListener('htmx:afterRequest', function (e) {
  if (!e.detail.successful) return;
  var xhr = e.detail.xhr;
  var url = (xhr && xhr.responseURL) || '';
  if (url.indexOf('/fragment/graph/tail') !== -1) {
    try {
      var lim = new URL(url).searchParams.get('limit');
      var g = document.getElementById('graph');
      if (g && lim) g.dataset.graphLimit = lim;
    } catch (err) {
      /* ignore */
    }
    syncViewingHighlight();
    syncWorktreeFileSelection();
  }
  if (url.indexOf('/api/repo') !== -1) {
    var rd = document.querySelector('details.repo-bar-details');
    if (rd) rd.removeAttribute('open');
  }
});

document.addEventListener('click', function (e) {
  var rd = document.querySelector('details.repo-bar-details');
  if (!rd || !rd.open) return;
  if (rd.contains(e.target)) return;
  rd.removeAttribute('open');
}, true);

document.addEventListener('keydown', function (e) {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'Escape') {
    const d = document.getElementById('diff');
    if (d) d.outerHTML = EMPTY_DIFF;
    syncViewingHighlight();
  }
});

document.addEventListener('click', function (e) {
  const btn = e.target.closest('.copy-sha-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  var sha = btn.getAttribute('data-sha');
  if (!sha || !navigator.clipboard || !navigator.clipboard.writeText) return;
  navigator.clipboard.writeText(sha);
  btn.classList.add('copy-sha-flash');
  setTimeout(function () { btn.classList.remove('copy-sha-flash'); }, 700);
});
`

const SSE_SCRIPT = `
(function () {
  function start() {
    if (typeof htmx === 'undefined') { setTimeout(start, 50); return; }
    var es = new EventSource('/events');
    es.addEventListener('changed', function () {
      var g = document.getElementById('graph');
      var limRaw = g && g.dataset ? g.dataset.graphLimit : '';
      var lim = parseInt(String(limRaw || '50'), 10);
      if (!Number.isFinite(lim) || lim < 10) lim = 50;
      htmx.ajax('GET', '/fragment/graph?limit=' + encodeURIComponent(String(lim)), { target: '#graph', swap: 'outerHTML' });
    });
  }
  start();
})();
`

const WT_POLL_SCRIPT = `
setInterval(function () {
  if (document.visibilityState !== 'visible') return;
  if (typeof htmx === 'undefined') return;
  var w = document.getElementById('worktree');
  if (w) {
    htmx.ajax('GET', '/fragment/worktree', { target: '#worktree', swap: 'outerHTML' });
  }
}, 3000);
`

export function Layout(props: { children: unknown }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>dumbgit</title>
        <script
          src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js"
          defer
        ></script>
        <style>{raw(CSS)}</style>
      </head>
      <body>
        {props.children}
        <script>{raw(KEY_SCRIPT)}</script>
        <script>{raw(SSE_SCRIPT)}</script>
        <script>{raw(WT_POLL_SCRIPT)}</script>
      </body>
    </html>
  )
}

