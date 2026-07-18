/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'

const CSS = `
:root {
  --bg: #1e1e1e;
  --fg: #e8e8e8;
  --muted: #858585;
  --accent: #569cd6;
  --graph-rail-muted: #5a5a5a;
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
.sse-disconnect-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 99999;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: var(--fg);
  font-size: 15px;
  text-align: center;
  padding: 24px;
}
.sse-disconnect-overlay.is-visible {
  display: flex;
}
.sse-disconnect-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 28em;
}
.sse-disconnect-icon {
  width: 44px;
  height: 44px;
  color: var(--error);
  opacity: 0.95;
}
.sse-disconnect-card p {
  margin: 0;
  line-height: 1.5;
}
.sse-disconnect-refresh {
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  padding: 8px 18px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #2d2d2d;
  color: var(--fg);
  min-height: 34px;
}
.sse-disconnect-refresh:hover {
  background: #3a3a3a;
  border-color: #555;
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
  grid-template-columns: minmax(0, var(--graph-w, 60%)) 8px minmax(0, 1fr);
  align-items: stretch;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.main-resizer {
  position: relative;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
}
.main-resizer:hover::after,
body.main-grid-dragging .main-resizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: var(--accent);
}
body.main-grid-dragging {
  cursor: col-resize;
  user-select: none;
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
.graph-repo-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--fg);
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  flex-shrink: 0;
}
.graph-head .graph-repo-name {
  padding-right: 12px;
  margin-right: 2px;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
}
.graph-error-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: #2d2d30;
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
.workspace-entry {
  min-height: 30px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  color: var(--muted);
  text-decoration: none;
  font-size: 11px;
}
.workspace-entry:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(86, 156, 214, 0.1);
}
.graph-error-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.wt-stash-btn {
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 8px;
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
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  margin-bottom: 2px;
}
.wt-section-action {
  margin-left: auto;
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.3;
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
.log-row-head {
  border-left-color: transparent;
}
.log-row-head .msg-btn {
  color: #fff;
  font-weight: 600;
}
.log-row-detached {
  border-left-color: #e0a23a !important;
  background: rgba(224, 162, 58, 0.09) !important;
}
.log-row-detached .branch-prefix {
  background: rgba(224, 162, 58, 0.25) !important;
  color: #ffd58a !important;
  box-shadow: none !important;
}
/* Viewing row: blue is the only "row color" in the log — it means "active focus",
   and visually pairs with the diff panel chrome on the right. */
.log-row-commit.log-row-viewing {
  box-shadow: inset 3px 0 0 0 var(--accent);
  background: rgba(86, 156, 214, 0.14);
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
/* Runs of consecutive connector rows can't all collapse onto the same spot. */
.log-row-other.log-row-other-tall {
  height: 16px;
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
.graph-stash-node {
  fill: #252526;
  stroke: var(--graph-rail-muted);
  stroke-width: 1.7;
  opacity: 0.58;
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
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  padding: 0 6px;
  border-radius: 4px;
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
  font-size: 12px;
  line-height: 18px;
  padding: 0 6px;
  border: 0;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.035);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.86);
}
.ref-pill-branch:hover {
  background: rgba(156, 220, 254, 0.22);
  box-shadow: inset 0 0 0 1px rgba(156, 220, 254, 0.4);
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
/* Hue identifies the lane; high-contrast text remains independently readable. */
.branch-prefix.lane-tint,
.ref-pill-branch.lane-tint,
.ref-pill-head.lane-tint {
  color: var(--fg);
  background: rgba(255, 255, 255, 0.045);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lane) 50%, #555);
}
.branch-prefix.lane-tint:hover,
.ref-pill-branch.lane-tint:hover {
  color: #fff;
  background: color-mix(in srgb, var(--lane) 16%, #333);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lane) 72%, #555);
}
.ref-pill-remote.lane-tint {
  color: #c8c8c8;
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.025);
}
.ref-pill-remote.lane-tint:hover {
  color: #fff;
  border-color: color-mix(in srgb, var(--lane) 70%, #666);
  opacity: 1;
}
.ref-branch-ico {
  flex: 0 0 auto;
  color: var(--lane);
}
.ref-pill-head.lane-tint {
  color: #fff;
  background: color-mix(in srgb, var(--lane) 13%, #333);
}
.ref-peer-sep {
  color: var(--muted);
  opacity: 0.8;
}
.ref-peer {
  color: var(--muted);
  font-weight: 600;
}
.log-row-stash {
  color: var(--muted);
}
.log-row-stash .ref-pill-stash {
  color: var(--fg);
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.14);
  opacity: 0.72;
}
.log-row-stash .stash-msg {
  cursor: default;
  color: var(--fg);
  opacity: 0.62;
}
.log-row-stash .msg-age {
  opacity: 0.72;
}
.log-row-stash:hover .ref-pill-stash,
.log-row-stash:hover .stash-msg,
.log-row-stash:hover .msg-age {
  opacity: 0.85;
}
.log-row-stash .stash-drop-btn:hover,
.log-row-stash .stash-drop-btn.confirm-armed {
  color: var(--error);
  background: rgba(244, 71, 71, 0.12);
}
.branch-prefix {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  overflow: visible;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  color: rgba(255, 255, 255, 0.86);
  background: rgba(255, 255, 255, 0.035);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  border-radius: 3px;
  padding: 0 5px;
  cursor: pointer;
  user-select: none;
}
.row-action-btn {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 14px;
  color: var(--muted);
  border-radius: 3px;
  padding: 2px 4px;
}
.row-action-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  color: var(--accent);
}
.row-action-ico {
  display: block;
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
.branch-prefix:hover .inline-action-btn {
  display: inline-flex;
}
.inline-action-btn:hover {
  color: #ffffff;
  background: rgba(86, 156, 214, 0.34);
}
.copy-btn {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  padding: 1px 2px;
  border-radius: 3px;
  color: inherit;
  opacity: 0.7;
}
.copy-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}
.copy-ico { display: block; }
.check-ico { display: none; }
.copy-btn.copy-flash .copy-ico { display: none; }
.copy-btn.copy-flash .check-ico { display: block; }
.copy-flash {
  color: var(--success) !important;
  opacity: 1 !important;
}
.ref-pill .copy-btn,
.branch-prefix .copy-btn {
  display: none;
}
.ref-pill:hover .copy-btn,
.branch-prefix:hover .copy-btn {
  display: inline-flex;
}
.confirm-armed {
  color: #ffd58a !important;
  border-color: rgba(224, 162, 58, 0.6) !important;
  background: rgba(224, 162, 58, 0.18) !important;
}
.confirm-busy {
  display: inline-flex !important;
  color: var(--muted) !important;
  background: rgba(255, 255, 255, 0.06) !important;
  cursor: wait;
  pointer-events: none;
}
.branch-prefix:hover {
  background: rgba(156, 220, 254, 0.22);
  box-shadow: inset 0 0 0 1px rgba(156, 220, 254, 0.4);
  color: #9cdcfe;
}
.log-row-head .branch-prefix {
  font-weight: 700;
}
.log-row-head .branch-prefix.lane-tint {
  color: #fff;
  background: color-mix(in srgb, var(--lane) 15%, #333);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lane) 72%, #555);
}
/* Secondary row actions overlay the right edge on hover without reflowing text. */
.row-end {
  position: relative;
  align-self: stretch;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}
.msg-age {
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
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
.row-tail {
  display: none;
  position: absolute;
  z-index: 2;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  align-items: center;
  gap: 5px;
  height: 20px;
  padding-left: 28px;
  white-space: nowrap;
  background: linear-gradient(90deg, transparent, #2e2e2f 28px);
}
.log-row:hover .row-tail {
  display: inline-flex;
}
.log-row:hover .row-end > .msg-age {
  visibility: hidden;
}
.log-row-viewing:hover .row-tail {
  background: linear-gradient(90deg, transparent, #2d414f 28px);
}
.hash-peek {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 11px;
  color: var(--muted);
  user-select: all;
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
.status-slot:empty {
  margin: 0;
}
.status-inner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
}
.status-text {
  margin: 0;
  flex: 1 1 auto;
  white-space: pre-wrap;
  word-break: break-word;
  font: inherit;
}
.status-close {
  flex: 0 0 auto;
  align-self: center;
  width: 18px;
  height: 18px;
  line-height: 16px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  opacity: 0.55;
  cursor: pointer;
}
.status-close:hover {
  opacity: 1;
  border-color: currentColor;
}
.status-error {
  border: 1px solid var(--error);
  background: #3c2020;
  color: var(--error);
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
  flex-direction: column;
  gap: 8px;
}
.diff-tag {
  font-size: 11px;
  color: #d6bce8;
}
.diff-tag-name {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  max-width: 100%;
  font-weight: 600;
}
.diff-tag-name .tag-ico {
  display: block;
  flex-shrink: 0;
}
.diff-tag-message {
  margin: 4px 0 0;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(214, 188, 232, 0.82);
  font: inherit;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
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
.diff-subject-open {
  font: inherit;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.diff-subject-open .diff-subject-path {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: rgba(255, 255, 255, 0.32);
  text-underline-offset: 3px;
}
.diff-subject-open .open-ico {
  flex-shrink: 0;
  color: var(--muted);
}
.diff-subject-open:hover .diff-subject-path,
.diff-subject-open:focus-visible .diff-subject-path {
  color: var(--accent);
  text-decoration-style: solid;
  text-decoration-color: var(--accent);
}
.diff-subject-open:hover .open-ico,
.diff-subject-open:focus-visible .open-ico {
  color: var(--accent);
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
.worktree-action-danger:hover,
.worktree-action-danger.confirm-armed {
  border-color: var(--error);
  color: var(--error);
  background: rgba(244, 71, 71, 0.12);
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
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
  font-size: 12px;
  flex: 0 0 auto;
  min-height: 0;
}
.diff-add {
  display: block;
  color: #89d185;
  background: rgba(106, 153, 85, 0.12);
  border-left: 2px solid #89d185;
  padding-left: 6px;
}
.diff-del {
  display: block;
  color: #f48771;
  background: rgba(244, 135, 113, 0.1);
  border-left: 2px solid #f48771;
  padding-left: 6px;
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

.workspace-page {
  width: 100%;
  height: 100vh;
  min-height: 0;
  padding: 12px 16px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  overflow: hidden;
}
.workspace-page:has(.workspace-inspector:not([hidden])) {
  grid-template-rows: auto minmax(230px, 46%) minmax(260px, 1fr);
}
.workspace-toolbar {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.workspace-title-block {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.workspace-title-block h1 {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 17px;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
.workspace-title-block p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 10px;
}
.workspace-back,
.workspace-refresh,
.workspace-depth a {
  color: var(--muted);
  text-decoration: none;
  border: 1px solid var(--border);
  background: #252526;
}
.workspace-back {
  width: 32px;
  height: 32px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}
.workspace-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.workspace-refresh {
  min-height: 30px;
  padding: 5px 10px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  font-size: 11px;
}
.workspace-depth {
  display: flex;
  align-items: center;
}
.workspace-depth a {
  min-width: 30px;
  min-height: 30px;
  padding: 5px 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.workspace-depth a:first-child {
  border-radius: 4px 0 0 4px;
}
.workspace-depth a:last-child {
  margin-left: -1px;
  border-radius: 0 4px 4px 0;
}
.workspace-depth a.is-active {
  position: relative;
  z-index: 1;
  color: var(--accent);
  border-color: rgba(86, 156, 214, 0.65);
  background: rgba(86, 156, 214, 0.13);
}
.workspace-back:hover,
.workspace-refresh:hover,
.workspace-depth a:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.workspace-back:active,
.workspace-refresh:active,
.workspace-depth a:active,
.workspace-open-repo:active {
  transform: scale(0.97);
}
.workspace-board {
  min-height: 0;
  overflow: auto;
  padding: 1px 4px 8px 1px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  align-content: start;
  gap: 10px;
  scrollbar-gutter: stable;
}
.workspace-repo-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: #252526;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.025);
}
.workspace-repo-stopped {
  border-color: #282828;
  background: #191919;
  box-shadow: none;
}
.workspace-repo-stopped .workspace-repo-identity,
.workspace-repo-stopped .workspace-timeline,
.workspace-repo-stopped .workspace-worktree-summary {
  filter: grayscale(1) saturate(0);
  opacity: 0.36;
}
.workspace-repo-stopped .workspace-card-head {
  border-bottom-color: #292929;
  background: #1f1f1f;
}
.workspace-repo-stopped .workspace-worktree-summary {
  border-bottom-color: #292929;
}
.workspace-repo-stopped.workspace-repo-error pre,
.workspace-repo-stopped.workspace-repo-error
  .workspace-card-head
  > div:first-child {
  filter: grayscale(1) saturate(0);
  opacity: 0.42;
}
.workspace-card-head {
  min-height: 53px;
  padding: 8px 10px 7px 12px;
  border-bottom: 1px solid var(--border);
  background: #2a2a2c;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.workspace-repo-identity {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  gap: 3px 8px;
}
.workspace-repo-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg);
  text-decoration: none;
  font-weight: 700;
  font-size: 13px;
}
a.workspace-repo-name:hover {
  color: var(--accent);
}
.workspace-branch {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--accent);
  font-size: 11px;
}
.workspace-repo-path {
  grid-column: 1 / -1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 9px;
}
.workspace-open-repo {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--muted);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.workspace-card-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.workspace-instance-toggle {
  min-width: 43px;
  min-height: 26px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #252526;
  color: var(--muted);
  font: inherit;
  font-size: 9px;
  cursor: pointer;
}
.workspace-instance-toggle.is-start {
  border-color: rgba(86, 156, 214, 0.55);
  background: rgba(86, 156, 214, 0.09);
  color: var(--accent);
}
.workspace-instance-toggle:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(86, 156, 214, 0.08);
}
.workspace-instance-toggle:active:not(:disabled) {
  transform: scale(0.97);
}
.workspace-instance-toggle:disabled {
  opacity: 0.38;
  cursor: default;
}
.workspace-instance-toggle.htmx-request {
  color: transparent;
  cursor: wait;
  position: relative;
}
.workspace-instance-toggle.htmx-request::after {
  content: '…';
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.workspace-control-error {
  grid-column: 1 / -1;
  padding: 8px 10px;
  border: 1px solid rgba(244, 135, 113, 0.55);
  border-radius: 5px;
  background: rgba(244, 135, 113, 0.08);
  color: var(--error);
  font-size: 10px;
}
.workspace-open-repo:hover {
  color: var(--accent);
  border-color: var(--border);
  background: rgba(86, 156, 214, 0.08);
}
.workspace-timeline {
  padding: 2px 0 5px;
}
.workspace-worktree-summary {
  width: 100%;
  min-height: 33px;
  min-width: 0;
  margin: 0;
  padding: 6px 10px 6px 12px;
  border: 0;
  border-bottom: 1px solid var(--border);
  border-left: 2px solid transparent;
  border-radius: 0;
  background: #252526;
  color: var(--muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}
.workspace-worktree-summary:hover {
  background: rgba(255, 255, 255, 0.035);
  color: var(--fg);
}
.workspace-worktree-summary:focus-visible {
  position: relative;
  z-index: 1;
  outline: 1px solid var(--accent);
  outline-offset: -2px;
}
.workspace-worktree-summary.workspace-row-selected {
  border-left-color: var(--accent);
  background: rgba(86, 156, 214, 0.13);
}
.workspace-worktree-summary.workspace-worktree-dirty {
  color: var(--fg);
}
.workspace-worktree-indicator {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border: 1.5px solid var(--graph-rail-muted);
  border-radius: 50%;
}
.workspace-worktree-dirty .workspace-worktree-indicator {
  border: 0;
  border-radius: 1px;
  background: var(--accent);
  transform: rotate(45deg);
}
.workspace-worktree-label {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.workspace-worktree-label > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.workspace-worktree-stats {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 9px;
  white-space: nowrap;
}
.workspace-timeline .log-lines {
  padding: 3px 0;
}
.workspace-repo-card .log-row {
  padding-left: 10px;
  padding-right: 10px;
}
.workspace-repo-card .log-row.workspace-row-selected {
  box-shadow: inset 3px 0 0 0 var(--accent);
  background: rgba(86, 156, 214, 0.14);
}
.workspace-repo-error {
  min-height: 120px;
}
.workspace-repo-error pre {
  margin: 0;
  padding: 12px;
  color: var(--error);
  white-space: pre-wrap;
  font: inherit;
  font-size: 11px;
}
.workspace-inspector {
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
.workspace-inspector[hidden] {
  display: none;
}
.workspace-inspector-context {
  min-height: 31px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
  background: #2d2d30;
  display: flex;
  align-items: center;
  gap: 8px;
}
.workspace-inspector-context strong {
  color: var(--fg);
  font-size: 11px;
}
.workspace-inspector-context span {
  color: var(--muted);
  font-size: 10px;
}
.workspace-inspector-close {
  width: 22px;
  height: 22px;
  margin-left: auto;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.workspace-inspector-close:hover {
  border-color: var(--border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--fg);
}
.workspace-inspector-close:active {
  transform: scale(0.97);
}
.workspace-inspector > .diff-panel {
  border-radius: 0 0 6px 6px;
}
.workspace-file-kind {
  width: 54px;
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 9px;
}

@media (max-width: 760px) {
  .workspace-page {
    padding: 8px;
  }
  .workspace-page:has(.workspace-inspector:not([hidden])) {
    grid-template-rows: auto minmax(240px, 52%) minmax(220px, 1fr);
  }
  .workspace-board {
    grid-template-columns: minmax(280px, 1fr);
  }
  .workspace-repo-path {
    display: none;
  }
  .workspace-card-head {
    min-height: 43px;
  }
  .workspace-file-kind {
    display: none;
  }
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

function syncWorkspaceSelection() {
  var inspector = document.getElementById('workspace-inspector');
  var repo = inspector && inspector.dataset ? inspector.dataset.workspaceRepo : '';
  var sha = inspector && inspector.dataset ? inspector.dataset.workspaceSha : '';
  var kind = inspector && inspector.dataset ? inspector.dataset.workspaceKind : '';
  document.querySelectorAll('[data-workspace-select]').forEach(function (row) {
    var ds = row.dataset || {};
    var match = !!repo && ds.repo === repo && (
      (sha && ds.workspaceSelect === 'commit' && ds.sha === sha) ||
      (kind === 'worktree' && ds.workspaceSelect === 'worktree')
    );
    row.classList.toggle('workspace-row-selected', match);
    if (match) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
  });
}

function closeWorkspaceInspector() {
  var inspector = document.getElementById('workspace-inspector');
  if (!inspector || inspector.hasAttribute('hidden')) return false;
  inspector.outerHTML = '<section id="workspace-inspector" class="workspace-inspector" hidden></section>';
  syncWorkspaceSelection();
  return true;
}

function clearConfirmButton(btn) {
  var old = btn.getAttribute('data-confirm-original');
  if (old !== null) btn.innerHTML = old;
  btn.classList.remove('confirm-armed');
  btn.classList.remove('confirm-busy');
  btn.removeAttribute('data-confirm-armed');
  btn.removeAttribute('data-confirm-original');
  btn.removeAttribute('aria-busy');
  var timer = btn.getAttribute('data-confirm-timer');
  if (timer) clearTimeout(Number(timer));
  btn.removeAttribute('data-confirm-timer');
}

function armConfirmBusy(btn) {
  var busyLabel = btn.getAttribute('data-confirm-busy-label');
  if (!busyLabel) return false;
  var timer = btn.getAttribute('data-confirm-timer');
  if (timer) clearTimeout(Number(timer));
  btn.removeAttribute('data-confirm-timer');
  btn.removeAttribute('data-confirm-armed');
  btn.classList.remove('confirm-armed');
  btn.textContent = busyLabel;
  btn.classList.add('confirm-busy');
  btn.setAttribute('aria-busy', 'true');
  return true;
}

function clearOtherConfirmButtons(btn) {
  document.querySelectorAll('[data-confirm-armed="true"]').forEach(function (other) {
    if (other !== btn) clearConfirmButton(other);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  syncViewingHighlight();
  syncWorktreeFileSelection();
  syncWorkspaceSelection();
});

document.addEventListener('click', function (e) {
  var btn = e.target && e.target.closest && e.target.closest('[data-confirm-label]');
  if (!btn) {
    clearOtherConfirmButtons(null);
    return;
  }
  clearOtherConfirmButtons(btn);
  if (btn.getAttribute('data-confirm-armed') === 'true') {
    if (!armConfirmBusy(btn)) clearConfirmButton(btn);
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  btn.setAttribute('data-confirm-armed', 'true');
  btn.setAttribute('data-confirm-original', btn.innerHTML);
  btn.textContent = '✓ ' + (btn.getAttribute('data-confirm-label') || 'confirm');
  btn.classList.add('confirm-armed');
  var timer = setTimeout(function () { clearConfirmButton(btn); }, 3000);
  btn.setAttribute('data-confirm-timer', String(timer));
}, true);

document.body.addEventListener('htmx:afterSwap', function (e) {
  var t = e.detail && e.detail.target;
  if (!t || !t.id) return;
  if (t.id === 'diff' || t.id === 'graph') {
    syncViewingHighlight();
    syncWorktreeFileSelection();
  }
  if (t.id === 'worktree') syncWorktreeFileSelection();
  if (t.id === 'workspace-board' || t.id === 'workspace-inspector') {
    syncWorkspaceSelection();
  }
});

document.addEventListener('click', function (e) {
  var close = e.target && e.target.closest && e.target.closest('.workspace-inspector-close');
  if (!close) return;
  e.preventDefault();
  closeWorkspaceInspector();
});

document.addEventListener('click', function (e) {
  var fileBtn = e.target && e.target.closest && e.target.closest('.diff-file-btn, .wt-file-btn');
  if (!fileBtn) return;
  clearSelectedFiles();
  fileBtn.classList.add(fileBtn.matches('.wt-file-btn') ? 'wt-file-selected' : 'diff-file-selected');
  fileBtn.setAttribute('aria-current', 'true');
});

document.addEventListener('click', function (e) {
  var row = e.target && e.target.closest && e.target.closest('[data-workspace-select]');
  if (!row) return;
  document.querySelectorAll('.workspace-row-selected').forEach(function (other) {
    other.classList.remove('workspace-row-selected');
    other.removeAttribute('aria-current');
  });
  row.classList.add('workspace-row-selected');
  row.setAttribute('aria-current', 'true');
});

document.body.addEventListener('htmx:beforeRequest', function (e) {
  var elt = e.detail && e.detail.elt;
  if (!elt || !elt.matches || !elt.matches('[data-confirm-busy-label]')) return;
  if (elt.classList.contains('confirm-busy')) return;
  armConfirmBusy(elt);
});

document.body.addEventListener('htmx:afterRequest', function (e) {
  var elt = e.detail && e.detail.elt;
  if (elt && elt.matches && elt.matches('[data-confirm-busy-label]') && !e.detail.successful) {
    clearConfirmButton(elt);
  }
  if (!e.detail.successful) return;
  var xhr = e.detail.xhr;
  if (!xhr) return;
  var url = xhr.responseURL || '';
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
});

function dismissStatus() {
  var s = document.getElementById('status');
  if (!s || !s.firstElementChild) return false;
  s.innerHTML = '';
  return true;
}

document.addEventListener('click', function (e) {
  var btn = e.target && e.target.closest && e.target.closest('.status-close');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  dismissStatus();
});

document.addEventListener('keydown', function (e) {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'Escape') {
    if (dismissStatus()) return;
    if (closeWorkspaceInspector()) return;
    const d = document.getElementById('diff');
    if (d) d.outerHTML = EMPTY_DIFF;
    syncViewingHighlight();
  }
});

document.addEventListener('click', function (e) {
  if (e.target.closest('.inline-action-btn')) return;
  var host = e.target.closest('[data-copy]');
  if (!host) return;
  var text = host.getAttribute('data-copy');
  if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return;
  e.preventDefault();
  e.stopPropagation();
  navigator.clipboard.writeText(text);
  var icon = host.matches('.copy-btn') ? host : host.querySelector('.copy-btn');
  if (!icon) return;
  icon.classList.add('copy-flash');
  setTimeout(function () { icon.classList.remove('copy-flash'); }, 1500);
});
`

const REPO_SYNC_SCRIPT = `
function localServerIdentity() {
  var g = document.getElementById('graph');
  if (g && g.dataset && g.dataset.repo) {
    return {
      repo: g.dataset.repo,
      pid: g.dataset.serverPid ? Number(g.dataset.serverPid) : undefined,
    };
  }
  return null;
}

function resyncPage() {
  location.replace((location.pathname || '/') + '?_=' + Date.now());
}

async function ensureRepoSync() {
  var local = localServerIdentity();
  if (!local || !local.repo || local.pid === undefined) return false;
  try {
    var r = await fetch('/healthz.json', { cache: 'no-store' });
    if (!r.ok) return false;
    var j = await r.json();
    if (j.repo !== local.repo || String(j.pid) !== String(local.pid)) {
      resyncPage();
      return true;
    }
  } catch (_) {}
  return false;
}

ensureRepoSync();
`

const SSE_SCRIPT = `
(function () {
  var DISCONNECT_MS = 3000;
  function overlayEl() {
    return document.getElementById('sse-disconnect-overlay');
  }
  function showDisconnect() {
    var el = overlayEl();
    if (!el) return;
    el.classList.add('is-visible');
    el.setAttribute('aria-hidden', 'false');
  }
  function hideDisconnect() {
    var el = overlayEl();
    if (!el) return;
    el.classList.remove('is-visible');
    el.setAttribute('aria-hidden', 'true');
  }
  function start() {
    if (typeof htmx === 'undefined') { setTimeout(start, 50); return; }
    var es = new EventSource('/events');
    var showTimer = null;
    es.addEventListener('open', function () {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      hideDisconnect();
      ensureRepoSync();
    });
    es.addEventListener('ready', function () {
      ensureRepoSync();
    });
    es.addEventListener('error', function () {
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(function () {
        showTimer = null;
        if (es.readyState !== EventSource.OPEN) showDisconnect();
      }, DISCONNECT_MS);
    });
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

const RESIZER_SCRIPT = `
(function () {
  var KEY = 'dumbgit:graph-w';
  var MIN_GRAPH_PX = 320;
  var MIN_DIFF_PX = 280;
  var RESIZER_PX = 8;
  var FALLBACK_MIN_PCT = 15;
  var FALLBACK_MAX_PCT = 85;
  function clampFallback(n) {
    return Math.min(FALLBACK_MAX_PCT, Math.max(FALLBACK_MIN_PCT, n));
  }
  function clampPct(n) {
    if (!Number.isFinite(n)) return null;
    var grid = document.querySelector('.main-grid');
    if (!grid) return clampFallback(n);
    var w = grid.getBoundingClientRect().width;
    if (w <= 0) return clampFallback(n);
    var minPct = (MIN_GRAPH_PX / w) * 100;
    var maxPct = ((w - RESIZER_PX - MIN_DIFF_PX) / w) * 100;
    if (minPct > maxPct) return clampFallback(n);
    return Math.min(maxPct, Math.max(minPct, n));
  }
  function applyPct(pct) {
    var grid = document.querySelector('.main-grid');
    if (!grid) return;
    grid.style.setProperty('--graph-w', pct + '%');
  }
  function loadPct() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (_) {}
    if (raw == null) return;
    var n = clampPct(Number(raw));
    if (n != null) applyPct(n);
  }
  function savePct(pct) {
    try { localStorage.setItem(KEY, String(pct)); } catch (_) {}
  }
  function attach() {
    var resizer = document.querySelector('.main-resizer');
    var grid = document.querySelector('.main-grid');
    if (!resizer || !grid) return;
    var dragging = false;
    var pointerId = null;
    resizer.addEventListener('pointerdown', function (e) {
      dragging = true;
      pointerId = e.pointerId;
      try { resizer.setPointerCapture(pointerId); } catch (_) {}
      document.body.classList.add('main-grid-dragging');
      e.preventDefault();
    });
    resizer.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var rect = grid.getBoundingClientRect();
      if (rect.width <= 0) return;
      var pct = clampPct(((e.clientX - rect.left) / rect.width) * 100);
      if (pct != null) applyPct(pct);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      try { resizer.releasePointerCapture(pointerId); } catch (_) {}
      document.body.classList.remove('main-grid-dragging');
      var raw = grid.style.getPropertyValue('--graph-w');
      var n = parseFloat(raw);
      if (Number.isFinite(n)) savePct(n);
    }
    resizer.addEventListener('pointerup', endDrag);
    resizer.addEventListener('pointercancel', endDrag);
    resizer.addEventListener('dblclick', function () {
      try { localStorage.removeItem(KEY); } catch (_) {}
      var grid = document.querySelector('.main-grid');
      if (grid) grid.style.removeProperty('--graph-w');
    });
  }
  loadPct();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
`

const WT_POLL_SCRIPT = `
setInterval(async function () {
  if (document.visibilityState !== 'visible') return;
  if (typeof htmx === 'undefined') return;
  if (await ensureRepoSync()) return;
  var w = document.getElementById('worktree');
  if (w) {
    htmx.ajax('GET', '/fragment/worktree', { target: '#worktree', swap: 'outerHTML' });
  }
}, 3000);
`

const WORKSPACE_POLL_SCRIPT = `
setInterval(function () {
  if (document.visibilityState !== 'visible') return;
  if (typeof htmx === 'undefined') return;
  var board = document.getElementById('workspace-board');
  if (!board) return;
  var limit = board.dataset ? board.dataset.workspaceLimit : '5';
  htmx.ajax('GET', '/fragment/workspace?limit=' + encodeURIComponent(limit || '5'), {
    target: '#workspace-board',
    swap: 'outerHTML',
  });
}, 5000);
`

export function Layout(props: { children: unknown; title?: string }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title ?? 'dumbgit'}</title>
        <script
          src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js"
          defer
        ></script>
        <style>{raw(CSS)}</style>
      </head>
      <body>
        <div
          id="sse-disconnect-overlay"
          class="sse-disconnect-overlay"
          aria-hidden="true"
          role="alertdialog"
          aria-label="Disconnected from local server"
        >
          <div class="sse-disconnect-card">
            <svg
              class="sse-disconnect-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m19 5 3-3" />
              <path d="m2 22 3-3" />
              <path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" />
              <path d="M7.5 13.5 10 11" />
              <path d="M10.5 16.5 13 14" />
              <path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z" />
            </svg>
            <p>Disconnected from the local server.</p>
            <button
              type="button"
              class="sse-disconnect-refresh"
              onclick="location.reload()"
            >
              Refresh
            </button>
          </div>
        </div>
        {props.children}
        <script>{raw(KEY_SCRIPT)}</script>
        <script>{raw(REPO_SYNC_SCRIPT)}</script>
        <script>{raw(SSE_SCRIPT)}</script>
        <script>{raw(WT_POLL_SCRIPT)}</script>
        <script>{raw(WORKSPACE_POLL_SCRIPT)}</script>
        <script>{raw(RESIZER_SCRIPT)}</script>
      </body>
    </html>
  )
}
