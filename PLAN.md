# SketchNotes - Implementation Plan

## Context

Building a greenfield markdown notepad with integrated sketchpad from SPEC.md. The project directory currently contains only the spec — everything is built from scratch with no external project dependencies.

---

## Tech Stack & Key Packages

| Package | Purpose |
|---------|---------|
| `next@^15` + `react@^19` | Framework |
| `better-sqlite3` | SQLite driver (sync, server-only) |
| `jose` | JWT sign/verify (ESM, zero deps) |
| `bcryptjs` | Password hashing (pure JS) |
| `resend` | Password reset emails |
| `react-markdown` + `remark-gfm` + `rehype-highlight` | Markdown preview |
| `react-resizable-panels` | Three-panel resizable layout |
| `@react-pdf/renderer` | PDF export |
| `uuid` | Entity IDs |
| `tailwindcss@^4` | Styling |

**Key decisions:**
- `bcryptjs` over `bcrypt` — pure JS, no native build issues
- `jose` over `jsonwebtoken` — ESM-native, Edge-compatible
- `rehype-highlight` over shiki — simpler, integrates directly into react-markdown pipeline
- Raw SQL migrations over ORM — 5 tables, not worth the abstraction
- `next.config.ts`: `output: 'standalone'` + `serverExternalPackages: ['better-sqlite3']`

---

## Phase 1: Project Scaffolding + Database + Auth Backend

**Goal:** Working Next.js app with SQLite, user registration/login, JWT-protected routes.

1. `npx create-next-app@15 . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"`
2. Install deps: `better-sqlite3 jose bcryptjs uuid resend react-markdown remark-gfm rehype-highlight react-resizable-panels @react-pdf/renderer clsx highlight.js`
3. Install dev deps: `@types/better-sqlite3 @types/bcryptjs @types/uuid`

4. **`/lib/db.ts`** — Singleton DB connection
   - Path: `process.env.DATABASE_URL || './data/sketchnotes.db'`
   - `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON`
   - Run migrations on first import (check `_migrations` table)

5. **`/migrations/001_initial.sql`** — All 5 tables from spec
   - `users`, `notes`, `notes_fts` (FTS5), `images`, `password_reset_tokens`, `user_preferences`
   - FTS5 sync triggers (AFTER INSERT/UPDATE/DELETE on notes)

6. **`/lib/auth.ts`** — JWT helpers
   - `hashPassword`, `verifyPassword` (bcryptjs, 12 rounds)
   - `signToken`, `verifyToken` (jose, HS256, no expiry per spec)
   - `getAuthUser(request)` — extract from Bearer header or httpOnly cookie

7. **Auth API routes:**
   - `POST /api/auth/register` — validate, hash, insert user, create "Getting Started" note, return JWT + set cookie
   - `POST /api/auth/login` — verify credentials, return JWT
   - `POST /api/auth/logout` — clear cookie

8. **`/middleware.ts`** — redirect unauthenticated users from `/(app)/*` to `/login`

**Verify:** curl register/login, check SQLite file for tables and user record.

---

## Phase 2: Auth Frontend + Layout Shell + Dark Mode

**Goal:** Login/register pages, authenticated layout with sidebar, dark mode toggle.

1. **Theme system** (`/lib/use-theme.ts`)
   - Context provider, system preference via `matchMedia`, localStorage override
   - Apply `dark` class to `<html>` for Tailwind

2. **Auth pages** (`/app/(auth)/`)
   - `layout.tsx` — centered card layout
   - `LoginForm.tsx`, `RegisterForm.tsx` — email/password forms, client validation, fetch to API
   - `ForgotPasswordForm.tsx`, `ResetPasswordForm.tsx`

3. **Forgot/reset password backend:**
   - `POST /api/auth/forgot-password` — generate token, store with 1hr expiry, send via Resend
   - `POST /api/auth/reset-password` — validate token, update password

4. **App layout shell** (`/app/(app)/layout.tsx`)
   - `Sidebar.tsx` — "New Note" button, pinned section, notes list, search, trash link, logout
   - Mobile: sidebar hidden, hamburger toggle

**Verify:** Full auth flow in browser. Dark mode toggle. Responsive sidebar.

---

## Phase 3: Notes CRUD + Sidebar List

**Goal:** Create, read, update, delete notes with auto-titles, pinning, FTS5 search, trash.

1. **Notes API routes:**
   - `GET /api/notes?q=` — list active notes, FTS5 search if `q` present, order by `is_pinned DESC, updated_at DESC`
   - `POST /api/notes` — create with UUID, empty content
   - `GET /api/notes/[id]` — single note (verify ownership)
   - `PUT /api/notes/[id]` — update content/sketch, auto-generate title from first heading or line
   - `DELETE /api/notes/[id]` — soft delete (`deleted_at = now`)
   - `POST /api/notes/[id]/restore` — clear `deleted_at`
   - `DELETE /api/notes/[id]/permanent` — hard delete + remove images from disk
   - `POST /api/notes/[id]/pin` — toggle `is_pinned`

2. **Trash API:** `GET /api/trash`, `DELETE /api/trash` (empty all)

3. **Frontend:**
   - `NotesList.tsx` — pinned section + all notes, each showing title + relative timestamp
   - `SearchInput.tsx` — debounced 300ms, replaces list with results
   - `selectedNoteId` state in app layout
   - Trash page (`/app/(app)/trash/page.tsx`) — restore/delete permanently/empty trash

**Verify:** Create notes, see auto-titles in sidebar. Pin/unpin. Search. Delete to trash, restore, empty trash.

---

## Phase 4: Markdown Editor with Split View + Auto-Save

**Goal:** Split editor/preview with syntax highlighting, resizable panels, debounced auto-save.

1. **`ResizableWorkspace.tsx`** — three panels via `react-resizable-panels`: Sidebar | Notepad | Sketchpad
   - Notepad splits into Editor | Preview (also resizable)
   - Persist panel sizes to `user_preferences`
   - Mobile (<768px): stacked layout

2. **`MarkdownEditor.tsx`** — `<textarea>` with monospace font, tab inserts 2 spaces

3. **`MarkdownPreview.tsx`** — `<ReactMarkdown>` with `remark-gfm` + `rehype-highlight`
   - Tailwind typography for prose styling
   - Dark/light highlight.js themes

4. **`/lib/use-autosave.ts`** — debounce 1500ms, `PUT /api/notes/[id]`
   - Status indicator: "Saving..." / "Saved" / "Error"
   - Cancel on unmount or note switch

5. **Preferences API:** `GET /api/preferences`, `PUT /api/preferences`

**Verify:** Type markdown, see live preview with GFM + code highlighting. Resize panels. Auto-save persists across reload. Stacked layout on mobile.

---

## Phase 5: Image Upload

**Goal:** Drag-drop/paste images into editor, upload to server, insert markdown reference.

1. **`POST /api/images`** — multipart upload, validate type/size (5MB max), save to `/data/images/{noteId}/uploaded/{uuid}.{ext}`
2. **`GET /api/images/[filename]`** — serve file with Content-Type + cache headers
3. **Editor integration:** `onPaste` + `onDrop` handlers — upload file, insert `![image](url)` at cursor
4. Ensure `/data/images/` directory created on DB init

**Verify:** Paste screenshot into editor, see it render in preview. Drag image file. Persists across reload.

---

## Phase 6: SketchPad (from scratch)

**Goal:** Canvas drawing tool with all spec'd features.

### Types (`/lib/sketch-types.ts`)
```
Tool: 'pen' | 'eraser' | 'text' | 'move' | 'pan'
Stroke: { id, points[], color, width }
TextElement: { id, text, position, color, fontSize }
SketchState: { strokes[], textElements[], canvasWidth, canvasHeight }
```

### SketchPad.tsx
- **Double-buffered canvas** — committed drawing canvas + active stroke canvas
- **DPR scaling** — `canvas.width = cssWidth * dpr` for crisp rendering
- **Coordinate system** — `panOffset` state, `screenToWorld`/`worldToScreen` helpers
- **Pointer Events API** (`onPointerDown/Move/Up`) — unifies mouse, touch, stylus
- **`touch-action: none`** on canvas to prevent browser gestures

**Tools:**
- **Pen** — record points on move, draw stroke, finalize on pointer up
- **Eraser** — proximity detection on strokes, bounding box hit-test on text elements
- **Text** — click to place `<input>` overlay, commit on blur/Enter, `ctx.fillText` to render
- **Move** — hit-test text elements, drag to reposition
- **Pan** — update `panOffset` by pointer delta

**Undo/Redo:**
- `history: HistoryEntry[]` + `historyIndex`
- Each action pushes a snapshot; undo/redo moves the index
- New action after undo truncates forward history
- Toolbar buttons + Ctrl+Z / Ctrl+Shift+Z

**Canvas resize:** Drag handle at bottom-right corner

**Dark mode:** Canvas bg `#1f2937` in dark, `#ffffff` in light. Black pen renders as white in dark mode. Export always uses white background.

### SketchPadToolbar.tsx
- Tool selector (5 tools), color selector (4 colors), undo/redo buttons, clear button

### Integration
- Serialize `SketchState` to JSON on changes, feed to `useAutosave`
- Export canvas to PNG data URL for `sketch_image`
- Load `sketch_data` JSON and replay on note open

**Verify:** Draw with all tools and colors. Undo/redo. Resize canvas. Switch notes — sketches save/restore. Touch device. Dark mode.

---

## Phase 7: PDF Export + Deployment

**Goal:** PDF download per note, Fly.io deployment with Litestream.

1. **`/lib/pdf-export.ts`** — `@react-pdf/renderer` `NoteDocument` component
   - Parse markdown AST, map nodes to PDF components (Text, View, Image)
   - Embed sketch as PNG image (white background)

2. **`GET /api/notes/[id]/export`** — `renderToBuffer`, return as `application/pdf` attachment

3. **Dockerfile** — multi-stage build (deps → builder → runner), install Litestream, standalone output

4. **`litestream.yml`** — S3 replica config

5. **`entrypoint.sh`** — restore DB from S3 if missing, run app via `litestream replicate -exec`

6. **`fly.toml`** — as per spec (volume mount at `/data`, ports 80/443)

**Verify:** Export note with markdown + sketch as PDF. Deploy to Fly.io, verify end-to-end. Restart instance, verify Litestream restores DB.

---

## Directory Structure

```
/app
  /(auth)/login, register, forgot-password, reset-password
  /(app)/layout.tsx, page.tsx, trash/page.tsx
  /api/auth/*, notes/*, trash/*, images/*, preferences/*
/components/ui/  — SketchPad, SketchPadToolbar, MarkdownEditor, MarkdownPreview, NotesList, SearchInput
/components/auth/ — LoginForm, RegisterForm, ForgotPasswordForm, ResetPasswordForm
/components/layout/ — Sidebar, ResizableWorkspace, MobileLayout
/lib/ — db.ts, auth.ts, api-client.ts, pdf-export.ts, sketch-types.ts, use-autosave.ts, use-theme.ts
/migrations/001_initial.sql
```

## Verification Strategy

Each phase has curl/browser tests described above. End-to-end: register → create note → write markdown → draw sketch → search → pin → export PDF → delete to trash → restore → deploy.
