# SketchNotes - Specification

A markdown notepad with integrated sketchpad, featuring auto-save, full-text search, and cloud sync.

## Core Concept

A personal note-taking webapp combining:
- **Markdown Editor**: Split-view with live preview, syntax highlighting, image uploads
- **Sketchpad**: Canvas-based drawing tool (ported from teacher project's SketchPad.tsx)
- **One sketch per note**: Each note has exactly one associated canvas

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (React 19) |
| Backend | Next.js API routes or Express |
| Database | SQLite + Litestream (S3 backup) |
| Auth | Email/password + JWT |
| Email | Resend (password reset) |
| Hosting | Fly.io (default .fly.dev domain) |
| Storage | Fly.io volume for images |

## Layout

### Desktop (Resizable Panels)
```
┌────────────┬───────────────────────────────────────────────────────────────┐
│ [+ New]    │  ┌─────────── Notepad ──────────┬────── Sketchpad ──────────┐ │
│            │  │            ◂▸ resizable      │         ◂▸ resizable      │ │
│ 📌 Pinned  │  ├──────────────┬───────────────┼───────────────────────────┤ │
│ ▸ Note A   │  │  Editor      │   Preview     │ Toolbar: 🖊 A ↖ ⬜ ✋ ↩ ↪  │ │
│            │  │  (markdown)  │   (rendered)  │ Colors: ⚫ 🔵 🔴 🟢       │ │
│ ──────────  │  │              │               │                           │ │
│ All Notes  │  │              │               │   ┌───────────────────┐   │ │
│ ▸ Note 1 ◀ │  │              │               │   │      Canvas       │   │ │
│ ▸ Note 2   │  │              │               │   │    (resizable)    │   │ │
│            │  │              │               │   └───────────────────┘   │ │
│ [🔍 Search]│  │              │               │          [Clear]          │ │
│ ──────────  │  └──────────────┴───────────────┴───────────────────────────┘ │
│ Trash (3)  │                                                                 │
└────────────┴─────────────────────────────────────────────────────────────────┘
```

### Mobile (Stacked)
```
┌─────────────────────────────┐
│ SketchNotes   [☰]  [Logout] │
├─────────────────────────────┤
│ [Notes ▾]   Current Note    │
├─────────────────────────────┤
│ Markdown Editor             │
├─────────────────────────────┤
│ Rendered Preview            │
├─────────────────────────────┤
│ Sketchpad Toolbar           │
│ Canvas                      │
└─────────────────────────────┘
```

## Features

### Authentication
- Email/password registration and login
- Password reset via email (Resend)
- Persistent sessions ("remember me" - no expiry until logout)
- JWT tokens

### Note Management
- **Flat list** organization (no folders)
- **Pinnable** notes (pinned appear at top)
- **Auto-generated titles** from first line/heading of content
- **Title + timestamp** shown in note list
- **Full-text search** (FTS5) with live search-as-you-type
- **Soft delete** with trash folder (manual empty)
- **Auto-save** debounced 1-2 seconds after changes
- **Last-write-wins** conflict resolution (no locking)
- **Sample "Getting Started" note** created for new users

### Markdown Editor
- **Split view**: Editor on left, rendered preview on right
- **Syntax highlighting** for code blocks (e.g., Shiki or Prism)
- **Image uploads**: Drag-drop or paste images into editor
- Images stored on fly.io volume, referenced by URL

### Sketchpad (Ported from Teacher)
**Tools:**
- Pen (draw)
- Eraser (erase strokes, click text to delete)
- Text overlay (editable - click to edit after placement)
- Arrow/Move (drag text elements)
- Pan (move canvas view)
- 4 colors: black, blue, red, green

**New Features (vs Teacher):**
- **Undo/Redo** for drawing strokes and text
- **Eraser deletes text** when clicked/tapped on text element
- **User-resizable canvas** (drag to resize)
- **Full dark mode** support (canvas adapts to theme)

**Preserved Features:**
- Double-buffered canvas rendering
- Touch/stylus support (essential)
- Device pixel ratio scaling for crisp lines
- Coordinate transformation for pan offset

### Export
- **Full PDF export**: Rendered markdown + embedded sketch image
- Single downloadable PDF per note

### Dark Mode
- **System-aware** dark mode for entire app
- Canvas adapts (dark background in dark mode)
- Exports maintain readability

### Responsive Design
- **Full responsive** support
- Optimized touch interactions for mobile/tablet
- Stacked layout on narrow screens

## Data Model

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Notes Table
```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT,                    -- Auto-generated from content
  content TEXT DEFAULT '',       -- Markdown content
  sketch_data TEXT,              -- Canvas state JSON (for undo/redo)
  sketch_image TEXT,             -- Path to PNG export
  is_pinned INTEGER DEFAULT 0,
  deleted_at DATETIME,           -- Soft delete timestamp (NULL = active)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search
CREATE VIRTUAL TABLE notes_fts USING fts5(title, content, content=notes, content_rowid=rowid);
```

### Images Table
```sql
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id),
  path TEXT NOT NULL,            -- File path on volume
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Password Reset Tokens
```sql
CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME
);
```

### User Preferences
```sql
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  panel_sizes TEXT,              -- JSON: {"notepad": 60, "sketchpad": 40}
  theme TEXT DEFAULT 'system',   -- 'light', 'dark', 'system'
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login, returns JWT
- `POST /api/auth/logout` - Invalidate session
- `POST /api/auth/forgot-password` - Send reset email
- `POST /api/auth/reset-password` - Reset with token

### Notes
- `GET /api/notes` - List notes (with search query param)
- `POST /api/notes` - Create note
- `GET /api/notes/:id` - Get single note
- `PUT /api/notes/:id` - Update note (content, sketch)
- `DELETE /api/notes/:id` - Soft delete (move to trash)
- `POST /api/notes/:id/restore` - Restore from trash
- `DELETE /api/notes/:id/permanent` - Hard delete
- `POST /api/notes/:id/pin` - Toggle pin status
- `GET /api/notes/:id/export` - Download as PDF

### Trash
- `GET /api/trash` - List deleted notes
- `DELETE /api/trash` - Empty trash (hard delete all)

### Images
- `POST /api/images` - Upload image, returns URL
- `GET /images/:filename` - Serve image file

### Preferences
- `GET /api/preferences` - Get user preferences
- `PUT /api/preferences` - Update preferences

## File Storage

**Location:** `/data/` volume on fly.io

```
/data/
├── sketchnotes.db           # SQLite database
├── sketchnotes.db-wal       # WAL file
├── images/
│   ├── {note_id}/
│   │   ├── sketch.png       # Current sketch export
│   │   └── uploaded/
│   │       ├── {uuid}.png   # Uploaded images
│   │       └── {uuid}.jpg
```

**Litestream** replicates database to S3-compatible storage.

## Frontend Structure

```
/app
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
├── (app)/
│   ├── layout.tsx              # Authenticated layout
│   ├── page.tsx                # Main app (notes list + editor)
│   └── trash/page.tsx          # Trash view
/components
├── ui/
│   ├── SketchPad.tsx           # Ported + enhanced from teacher
│   ├── MarkdownEditor.tsx
│   ├── MarkdownPreview.tsx
│   ├── NotesList.tsx
│   ├── ResizablePanels.tsx
│   └── SearchInput.tsx
├── auth/
│   ├── LoginForm.tsx
│   └── RegisterForm.tsx
/lib
├── api.ts                      # API client
├── auth.ts                     # Auth utilities
├── db.ts                       # Database connection
└── pdf-export.ts               # PDF generation
```

## SketchPad Enhancements

### Undo/Redo Implementation
```typescript
interface SketchState {
  strokes: Stroke[];           // Array of drawn strokes
  textElements: TextElement[];
}

// History stack for undo/redo
const [history, setHistory] = useState<SketchState[]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);

// Undo: go back in history
// Redo: go forward in history
// New action: truncate forward history, push new state
```

### Eraser Text Deletion
```typescript
// In eraser mode, on click/tap:
// 1. Check if click point intersects any text element bounding box
// 2. If yes, remove that text element from textElements array
// 3. Add to undo history
```

### Dark Mode Canvas
```typescript
// Canvas background color based on theme
const bgColor = isDarkMode ? '#1f2937' : '#ffffff';
const strokeColor = isDarkMode ? '#ffffff' : '#000000';
// Export: render with white background regardless of theme
```

## Deployment (Fly.io)

### fly.toml
```toml
app = "sketchnotes"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  DATABASE_URL = "/data/sketchnotes.db"

[mounts]
  source = "sketchnotes_data"
  destination = "/data"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

### Environment Variables (Secrets)
- `JWT_SECRET` - For signing tokens
- `RESEND_API_KEY` - Email service
- `LITESTREAM_ACCESS_KEY_ID` - S3 backup
- `LITESTREAM_SECRET_ACCESS_KEY` - S3 backup
- `LITESTREAM_BUCKET` - S3 bucket name

## Non-Requirements (Explicitly Out of Scope)
- Keyboard shortcuts
- Folders/hierarchical organization
- Real-time collaboration
- Version history per note
- Offline mode (requires backend)
- Multiple users sharing notes
- Auto-purge of trash
- Session expiry
