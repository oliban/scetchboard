# SketchNotes

A personal note-taking web app that combines a markdown editor with an integrated sketchpad. Each note has a split-view markdown editor with live preview and a canvas-based drawing tool — all with auto-save.

## Features

- **Markdown Editor** — Split-view with raw editor and live rendered preview
- **Sketchpad** — Canvas-based drawing with pen, eraser, text, move, and pan tools
- **Auto-save** — Debounced saving after changes
- **Full-text Search** — SQLite FTS5 powered search-as-you-type
- **Dark Mode** — System-aware theme with light/dark/system toggle
- **Responsive** — Resizable panels on desktop, tabbed interface on mobile
- **PDF Export** — Download notes as PDF with embedded sketch
- **Trash** — Soft delete with restore capability

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | SQLite (better-sqlite3) + Litestream |
| Auth | Email/password with JWT (jose) |
| Email | Resend (password reset) |
| Drawing | HTML5 Canvas |
| Hosting | Fly.io |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone git@github.com:oliban/scetchboard.git
cd scetchboard
npm install
```

### Environment

Create a `.env.local` file:

```env
JWT_SECRET=your-secret-key
DATABASE_URL=./data/sketchnotes.db
```

Optional (for password reset emails):

```env
RESEND_API_KEY=your-resend-key
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/
│   ├── (app)/           # Authenticated app routes
│   │   ├── page.tsx     # Main notes view
│   │   └── trash/       # Trash view
│   ├── (auth)/          # Auth pages (login, register, etc.)
│   ├── api/             # API routes (auth, notes, images, trash)
│   ├── globals.css      # Theme tokens and prose styles
│   └── layout.tsx       # Root layout with theme provider
├── components/
│   ├── auth/            # Login, register, password reset forms
│   ├── layout/          # Sidebar, ResizableWorkspace
│   └── ui/              # MarkdownEditor, MarkdownPreview, SketchPad, etc.
├── lib/                 # Auth, DB, hooks, types, PDF export
└── middleware.ts        # Auth middleware
```

## Deployment

Configured for Fly.io with SQLite on a persistent volume and Litestream for database replication.

```bash
fly deploy
```

See `fly.toml`, `Dockerfile`, and `litestream.yml` for deployment configuration.

## License

Private project.
