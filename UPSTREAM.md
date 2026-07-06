# Mesaas fork of OpenPencil

Base: upstream tag `v0.13.2`. Work branch: `mesaas`. `master` tracks upstream.

This fork powers the Mesaas Estúdio editor: the app runs embedded in an iframe
inside the Mesaas CRM, loading/saving documents over HTTP instead of local files.
Everything is gated on `embedConfig` (see `src/app/embed/`) — without
`?embed=1&docUrl=` the app behaves exactly like upstream.

## Diff surface (keep this list exact)

- `src/app/embed/` — all Mesaas embed-mode code (new files only; `config.ts` = pure URL
  parsing incl. `readOnly=1` view-only mode: HAND tool after doc load, no
  autosave/save/dirty, no toolbar/keybindings, dblclick+contextmenu neutralized)
- `src/app/document/io/source.ts` — embed save + autosave gate + readOnly guards (marked `// MESAAS:`)
- `src/app/document/io/browser.ts` — yieldToUI timeout fallback for throttled iframes (marked `// MESAAS:`, upstream PR candidate)
- `src/main.ts` — PWA skip in embed (marked `// MESAAS:`)
- `src/views/EditorView.vue` — chrome v-ifs + automation/collab guards (marked `// MESAAS:`)
- `src/components/PropertiesPanel.vue` — Design-only tabs in embed (marked `// MESAAS:`)
- `src/components/LayersPanel.vue` — menubar hidden in embed (marked `// MESAAS:`)
- `tests/engine/app/embed.test.ts` — embed unit tests (new file)
- `packages/core/src/io/formats/fig/export.ts` — guid-counter seeding scans ALL sessions
  (marked `// MESAAS:`, **upstream PR candidate — data-loss bug**: new-node guids mint in
  session 1 but the collision guard only cleared session 0, so import → createNode →
  export reused an imported session-1 guid and deleted the node that owned it)
- `tests/engine/io/fig/roundtrip/reexport-guids.test.ts` — regression test for the above (new file)
- `vercel.json`, `UPSTREAM.md` — deploy/docs (new files). `vercel.json` sets
  `Content-Security-Policy: frame-ancestors` locked to the Mesaas CRM production
  origins — the deployed editor can only be embedded by the CRM (dev servers are
  unaffected; the header ships only via Vercel)

## Rebase procedure

1. `git remote add upstream https://github.com/open-pencil/open-pencil` (once)
2. `git fetch upstream --tags && git switch master && git merge --ff-only upstream/master`
3. `git switch mesaas && git rebase <new-tag>` — conflicts can only occur in the files above
4. Re-run the embed test suite (`bun test src/app/embed/`) + the browser loop
   (sm-crm CRM host: `npm run dev` → Entregas → "Abrir no Estúdio") before pushing.
5. The Mesaas doc service pins the same `@open-pencil/core` version as this fork —
   upgrade BOTH together (render parity depends on it).

## Clone note

Upstream uses git-lfs with an auth-required backend; clone with
`GIT_LFS_SKIP_SMUDGE=1` (LFS objects are test fixtures, not needed to build/run).
Dev: `bun install && bun --bun run dev` (their Vite config needs Node ≥ 20.12,
so use bun's runtime).
