# TODO Tracker CLI -- Technical Architecture

## 1. Language Choice

### Comparison Matrix

| Criterion              | Rust                  | Go                    | Node.js               | Python                |
|------------------------|-----------------------|-----------------------|-----------------------|-----------------------|
| Startup time           | ~1-3ms                | ~5-10ms               | ~30-70ms              | ~30-100ms             |
| Parsing speed (100k files) | Fastest (zero-cost abstractions) | Very fast (goroutines) | Moderate (V8 JIT)   | Slowest               |
| Single binary          | Yes                   | Yes                   | No (needs Node runtime) | No (needs Python runtime) |
| Cross-compilation      | Possible but harder   | Trivial (`GOOS/GOARCH`) | N/A                 | N/A                   |
| CLI framework maturity | clap (excellent)      | cobra (excellent)     | commander/yargs (good)| click/typer (good)    |
| tree-sitter bindings   | Native (tree-sitter is written in C/Rust) | Go bindings exist | node bindings exist | Python bindings exist |
| Developer adoption for CLIs | Growing (ripgrep, fd, bat, delta) | Very strong (gh, docker, kubectl) | Moderate (eslint, prettier) | Moderate (black, mypy) |
| Install friction       | `cargo install` / binary | `go install` / binary | `npm i -g` (needs Node) | `pip install` (needs Python) |

### Recommendation: Rust

**Primary reasons:**

1. **Performance is the core value prop.** A TODO scanner that takes 200ms on a 100k-file repo feels instant; one that takes 5s does not. Rust's zero-cost abstractions, `rayon` for data parallelism, and the `ignore` crate (from ripgrep) give us best-in-class scanning speed with minimal effort.

2. **Single binary distribution.** No runtime dependency. Users run `brew install todo-tracker` or download a binary. This is the gold standard for developer CLI tools.

3. **The `ignore` crate.** ripgrep's own `.gitignore`-respecting parallel directory walker is a Rust library. We get production-proven, lock-free parallel file traversal with work-stealing queues -- the exact same engine that makes ripgrep fast. Reimplementing this in Go or Node would be significant effort.

4. **tree-sitter is a C library with first-class Rust bindings.** Since we want language-aware comment parsing, Rust gives us the tightest integration with tree-sitter without FFI overhead.

5. **The CLI ecosystem is mature.** `clap` (argument parsing), `serde` (serialization), `indicatif` (progress bars), `colored` (terminal colors), `anyhow`/`thiserror` (error handling) are all battle-tested.

**Trade-offs acknowledged:**
- Slower development velocity than Go (steeper learning curve, longer compile times)
- Cross-compilation is harder than Go (though `cross` and `cargo-zigbuild` mitigate this)
- Smaller contributor pool than Go for CLI tools

**If Rust is rejected,** Go is the clear second choice -- fast enough, trivial cross-compilation, strong CLI ecosystem. The main sacrifice is losing the `ignore` crate and native tree-sitter integration.

---

## 2. Parsing Strategy

### Recommendation: Hybrid -- regex-first with optional tree-sitter upgrade

The tool should support two parsing modes:

#### Mode 1: Regex-based (default, zero dependencies)

Fast, works on any file, no grammar files needed.

```
Pattern: (?i)\b(TODO|FIXME|HACK|XXX|BUG|NOTE)\b\s*[:(\[]?\s*(.*)
```

**How it works:**
1. The `ignore` crate walks the directory tree (respecting `.gitignore`)
2. For each file, read it as UTF-8 (skip binary files via BOM/null-byte detection)
3. For each line, apply the regex
4. If a match is in a comment context, extract the tag, optional attribution `(author)`, and message

**Comment-context detection (lightweight, no AST):**
- Maintain a per-file-extension mapping of comment syntax:
  - `//` for JS/TS/Rust/Go/Java/C/C++/Swift/Kotlin
  - `#` for Python/Ruby/Shell/YAML/TOML
  - `--` for SQL/Lua/Haskell
  - `%` for LaTeX/Erlang
  - `<!-- -->` for HTML/XML/Markdown
- For each matched line, verify the TODO tag appears after a comment delimiter
- Track multi-line comment state (`/* ... */`, `""" ... """`, `=begin ... =end`) with a simple state machine per file

**Strengths:** Fast (~ripgrep speed), no external grammars needed, works on any text file.
**Weaknesses:** Can produce false positives in strings like `"// TODO: example"`. Cannot distinguish doc comments from regular comments without language awareness.

#### Mode 2: tree-sitter-based (opt-in, higher accuracy)

For users who want zero false positives.

```
todo-tracker scan --parser=treesitter
```

**How it works:**
1. Same file walking via `ignore` crate
2. Detect language from file extension (with overrides via config)
3. Parse file with appropriate tree-sitter grammar
4. Query for `comment` nodes in the AST
5. Apply regex only within comment node text

**Supported languages (initial set):**

| Language    | Grammar crate              |
|-------------|----------------------------|
| JavaScript  | tree-sitter-javascript     |
| TypeScript  | tree-sitter-typescript     |
| Python      | tree-sitter-python         |
| Rust        | tree-sitter-rust           |
| Go          | tree-sitter-go             |
| Ruby        | tree-sitter-ruby           |
| Java        | tree-sitter-java           |
| C / C++     | tree-sitter-c / tree-sitter-cpp |

**Strengths:** Zero false positives. Correctly handles TODOs in strings vs comments. Can distinguish doc comments from inline comments.
**Weaknesses:** Larger binary (~15-20MB with grammars vs ~3MB without). ~2-5x slower than pure regex. Must ship grammar `.so` files or compile them in. Files without a grammar fall back to regex.

#### Why hybrid?

- **80/20 rule:** In practice, regex with comment-syntax awareness catches >95% of TODOs correctly. Most developers write `// TODO:` in actual comments, not inside string literals.
- **tree-sitter is an upgrade path,** not a requirement. Ship v1.0 with regex, add tree-sitter in v1.1+ behind a flag.
- **Binary size matters.** Developers don't want a 50MB binary for a TODO finder. Keep the default lean.

---

## 3. Performance Architecture

### Target: <500ms for a 100k-file monorepo on first scan

#### 3a. Parallel file scanning

Use the `ignore` crate's `WalkParallel`:
- Lock-free work-stealing queue across N worker threads (default: num_cpus)
- Each thread maintains its own `.gitignore` matcher hierarchy (cheap to clone via `Arc`)
- Respects `.gitignore`, `.ignore`, `.todoignore` (custom)
- Skips binary files, `node_modules` (via gitignore or hardcoded defaults), `.git/`

```
                     ┌─────────────┐
                     │  WalkParallel│
                     │  (ignore crate)│
                     └──────┬──────┘
                            │ file paths
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Worker 1 │ │ Worker 2 │ │ Worker N │
        │ parse()  │ │ parse()  │ │ parse()  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │             │             │
             ▼             ▼             ▼
        ┌────────────────────────────────────┐
        │   Concurrent collector (crossbeam) │
        └────────────────┬───────────────────┘
                         │ Vec<TodoItem>
                         ▼
                  ┌──────────────┐
                  │   Formatter  │
                  └──────────────┘
```

#### 3b. Incremental scanning

For repeat scans (e.g., in CI or watch mode):

1. **On first scan:** Compute and store file checksums (xxHash64 -- extremely fast) alongside results
2. **On subsequent scans:** `stat()` each file for mtime; if unchanged, skip. If changed, re-hash and re-parse only that file
3. **Deleted files:** Remove from cache if file no longer exists

This reduces repeat scans from 500ms to ~50ms on a 100k-file repo with 10 changed files.

#### 3c. Caching strategy

Cache file: `.todo/cache.bin` (MessagePack or bincode serialization for speed)

```rust
struct ScanCache {
    version: u32,              // Cache format version (invalidate on upgrade)
    repo_root: PathBuf,
    entries: HashMap<PathBuf, CacheEntry>,
}

struct CacheEntry {
    mtime: SystemTime,
    hash: u64,                 // xxHash64
    todos: Vec<TodoItem>,
}
```

**Invalidation rules:**
- Config file changed -> full rescan
- Cache version mismatch -> full rescan
- File mtime changed -> rescan that file
- File deleted -> remove entry

#### 3d. Memory efficiency

- Stream files line-by-line (don't load entire files into memory)
- Use `memmap2` for large files (>1MB) to let the OS manage paging
- Limit per-file allocations with arena allocators for parse results

---

## 4. Storage and State

### Recommendation: Stateful with a `.todo/` directory

```
project-root/
├── .todo/
│   ├── config.toml       # User configuration
│   ├── cache.bin          # Scan cache (binary, gitignored)
│   └── history.json       # Optional: TODO lifecycle tracking
├── .gitignore
└── src/
```

#### Why stateful over stateless?

| Aspect            | Stateless (scan every time) | Stateful (.todo/ dir)          |
|-------------------|-----------------------------|--------------------------------|
| Speed on re-scan  | Always full scan            | Incremental (10-100x faster)   |
| "New TODOs" diff  | Impossible without baseline | Trivial: compare to last scan  |
| CI integration    | Simpler (no state to manage)| Needs cache in CI or regenerate|
| Setup friction    | Zero                        | `todo-tracker init`            |
| Lifecycle tracking| Must shell out to git every time | Can maintain history        |

**Decision:** Default to stateful, but support `--no-cache` flag for stateless mode (useful in CI where you want a clean scan).

#### Config format: TOML

```toml
# .todo/config.toml

[scan]
tags = ["TODO", "FIXME", "HACK", "XXX", "BUG"]
exclude_patterns = ["vendor/**", "*.generated.*"]
parser = "regex"  # or "treesitter"

[output]
default_format = "pretty"  # pretty | json | csv | sarif

[git]
blame = true       # Annotate TODOs with git blame (slower)
track_age = true   # Show when TODO was introduced
```

#### Why not SQLite?

SQLite is overkill for this use case. We're storing a flat list of TODO items keyed by file path. A binary cache file (bincode/MessagePack) is:
- Faster to read/write (single mmap vs SQL parsing)
- Simpler (no SQL schema migrations)
- Smaller on disk

SQLite would make sense if we needed complex queries (e.g., "all TODOs by author in the last 30 days"), but that query is better served by combining the scan results with `git log` at query time.

#### Where to store state?

- **Project-level:** `.todo/` in the repo root (analogous to `.git/`, `.vscode/`)
- **User-level config:** `$XDG_CONFIG_HOME/todo-tracker/config.toml` (global defaults)
- The `.todo/cache.bin` should be added to `.gitignore` by `todo-tracker init`; `.todo/config.toml` should be committed (shared project config)

---

## 5. Output Formats

### Architecture: Pluggable formatters via trait

```rust
trait OutputFormatter {
    fn format(&self, results: &ScanResults, writer: &mut dyn Write) -> Result<()>;
}
```

### Built-in formatters

#### Pretty (default, for terminals)

```
src/auth/login.rs:42  TODO(jake): Handle token refresh on 401 responses
  Added: 2024-03-15 by jake@example.com (47 days ago)

src/db/migrations.rs:118  FIXME: This migration is not idempotent
  Added: 2024-01-02 by alice@example.com (120 days ago)

Found 23 TODOs (12 TODO, 8 FIXME, 3 HACK) across 156 files
```

Features: colored output, grouped by file or tag, relative timestamps, respects `NO_COLOR` env var.

#### JSON (for scripting and piping)

```json
{
  "version": "1.0",
  "scan_time_ms": 342,
  "total": 23,
  "items": [
    {
      "file": "src/auth/login.rs",
      "line": 42,
      "column": 5,
      "tag": "TODO",
      "author": "jake",
      "message": "Handle token refresh on 401 responses",
      "git_blame": {
        "commit": "a1b2c3d",
        "author_email": "jake@example.com",
        "date": "2024-03-15T10:30:00Z"
      }
    }
  ]
}
```

#### SARIF (for CI/CD integration)

SARIF v2.1.0 is the OASIS standard for static analysis results. GitHub, GitLab, and Azure DevOps all natively render SARIF. This lets `todo-tracker` integrate into code scanning dashboards.

```json
{
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
  "version": "2.1.0",
  "runs": [{
    "tool": { "driver": { "name": "todo-tracker", "version": "1.0.0" } },
    "results": [{
      "ruleId": "TODO",
      "level": "note",
      "message": { "text": "Handle token refresh on 401 responses" },
      "locations": [{
        "physicalLocation": {
          "artifactLocation": { "uri": "src/auth/login.rs" },
          "region": { "startLine": 42, "startColumn": 5 }
        }
      }]
    }]
  }]
}
```

#### CSV (for spreadsheet export)

```
file,line,tag,author,message,date
src/auth/login.rs,42,TODO,jake,Handle token refresh on 401 responses,2024-03-15
```

#### Count/Summary (for dashboards)

```
TODO:  12
FIXME:  8
HACK:   3
Total: 23
```

### Selecting format

```bash
todo-tracker scan --format=json
todo-tracker scan --format=sarif > results.sarif
todo-tracker scan --format=csv | sort -t, -k5
```

---

## 6. Extensibility

### Phase 1 (v1.0): Configuration-based extensibility

No plugin system. Instead, extensibility via config:

```toml
# Custom tags
[scan]
tags = ["TODO", "FIXME", "HACK", "SAFETY", "PERF", "DEBT"]

# Custom file type mappings for comment syntax
[languages.terraform]
extensions = [".tf", ".tfvars"]
line_comment = "#"

# Severity mapping (for SARIF output)
[severity]
TODO = "note"
FIXME = "warning"
BUG = "error"
HACK = "warning"
```

### Phase 2 (v2.0+): Plugin system via subprocess

Avoid embedded scripting (Lua, WASM). Instead, use a **subprocess protocol** inspired by Git hooks and LSP:

```toml
[plugins.jira-linker]
command = "todo-tracker-jira"
events = ["after_scan"]
```

Plugin receives scan results on stdin (JSON), can modify/augment them, writes to stdout. This is:
- Language-agnostic (plugins can be in any language)
- Secure (sandboxed by OS process isolation)
- Simple to implement and debug

**Plugin use cases:**
- Link TODOs to Jira/Linear tickets
- Post scan results to Slack
- Custom output formatters
- Auto-assign TODOs based on CODEOWNERS

### Why not WASM plugins?

WASM plugins (a la Zed, Extism) are technically elegant but add enormous complexity for a v1 tool. The subprocess approach is proven (Git hooks, pre-commit, GitHub Actions) and covers 95% of use cases. WASM can be evaluated for v3+ if there's demand for in-process plugins.

---

## 7. Git Integration

### 7a. Authorship via `git blame`

For each TODO found, optionally run `git blame -L {line},{line} --porcelain {file}` to get:
- Author name and email
- Commit hash
- Commit date (when the TODO was introduced)

**Performance concern:** `git blame` per-line is slow for thousands of TODOs. Mitigation:
- Batch blame per file: `git blame --porcelain {file}` returns all lines at once. Parse the output, extract only the lines we care about.
- Cache blame results in `.todo/cache.bin` alongside scan results
- Gate behind `--blame` flag or `git.blame = true` in config (off by default for speed)

### 7b. Age tracking via `git log`

For "when was this TODO introduced?" without full blame:

```bash
git log --diff-filter=A -p --follow -S "TODO" -- {file}
```

This is expensive. Better approach: use the blame data (which already contains the commit date) rather than running separate `git log` queries.

### 7c. Diff mode: new/resolved TODOs between refs

This is the killer CI feature:

```bash
# What TODOs were added in this PR?
todo-tracker diff main..HEAD

# What TODOs were added since last release?
todo-tracker diff v1.2.0..HEAD
```

**Implementation:**

1. Get the list of changed files: `git diff --name-only {base}..{head}`
2. For each changed file, get the unified diff: `git diff {base}..{head} -- {file}`
3. Parse the diff hunks: lines starting with `+` are additions, `-` are removals
4. Run TODO regex on added/removed lines
5. Report: "N new TODOs, M resolved TODOs"

This is lightweight (only scans changed files) and perfect for CI gates:

```yaml
# GitHub Actions
- run: |
    NEW_TODOS=$(todo-tracker diff origin/main..HEAD --format=json | jq '.added | length')
    if [ "$NEW_TODOS" -gt 0 ]; then
      echo "::warning::$NEW_TODOS new TODOs introduced in this PR"
    fi
```

### 7d. Pre-commit hook

```bash
# .git/hooks/pre-commit or via pre-commit framework
todo-tracker diff --staged --format=pretty
```

Scans only staged changes for new TODOs. Optionally block the commit if configured:

```toml
[git.hooks]
block_on_new_todos = false  # Set to true to enforce
blocked_tags = ["FIXME", "BUG"]  # Only block on specific tags
```

---

## 8. Component Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                          CLI Interface                             │
│  (clap)  scan | diff | init | config | stats | list | blame       │
└──────┬────────────┬──────────────┬─────────────┬──────────────────┘
       │            │              │             │
       ▼            ▼              ▼             ▼
┌──────────┐ ┌───────────┐ ┌───────────┐ ┌──────────────┐
│ Scanner  │ │ Differ    │ │ Configurer│ │ Stats/Report │
│          │ │           │ │           │ │              │
│ walk()   │ │ diff()    │ │ init()    │ │ summarize()  │
│ parse()  │ │ staged()  │ │ set()     │ │              │
│ cache()  │ │           │ │ get()     │ │              │
└────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬───────┘
     │             │             │               │
     ▼             ▼             ▼               │
┌──────────────────────────────────────┐         │
│           Core Engine                │         │
│                                      │         │
│  ┌────────────┐  ┌────────────────┐  │         │
│  │ FileWalker │  │ TodoParser     │  │         │
│  │ (ignore)   │  │                │  │         │
│  │            │  │ RegexParser    │  │         │
│  │ parallel   │  │ TreeSitParser  │  │         │
│  │ gitignore  │  │ (trait impl)   │  │         │
│  └──────┬─────┘  └───────┬────────┘  │         │
│         │                │           │         │
│         ▼                ▼           │         │
│  ┌─────────────────────────────┐     │         │
│  │ ScanResults                 │     │         │
│  │   items: Vec<TodoItem>      │     │         │
│  │   stats: ScanStats          │     │         │
│  └──────────────┬──────────────┘     │         │
│                 │                    │         │
└─────────────────┼────────────────────┘         │
                  │                              │
     ┌────────────┼──────────────┐               │
     ▼            ▼              ▼               ▼
┌──────────┐ ┌──────────┐ ┌──────────────────────────┐
│ Cache    │ │ Git      │ │ Formatter                 │
│ Manager  │ │ Integr.  │ │                           │
│          │ │          │ │ PrettyFormatter            │
│ load()   │ │ blame()  │ │ JsonFormatter              │
│ save()   │ │ diff()   │ │ SarifFormatter             │
│ invalidate│ │ log()   │ │ CsvFormatter               │
└──────────┘ └──────────┘ │ CountFormatter             │
                          │ (trait OutputFormatter)    │
                          └────────────────────────────┘
```

### Module breakdown

#### `cli` -- Command-line interface

- Uses `clap` derive macros for argument parsing
- Subcommands: `scan`, `diff`, `init`, `config`, `stats`, `list`, `blame`
- Handles `--format`, `--tags`, `--exclude`, `--parser`, `--no-cache`, `--blame`
- Entry point that wires everything together

#### `walker` -- File discovery

- Wraps `ignore::WalkParallel`
- Applies additional filter rules from config (custom excludes)
- Detects file language from extension
- Skips binary files

#### `parser` -- TODO extraction

```rust
pub trait TodoParser: Send + Sync {
    fn parse(&self, file_path: &Path, content: &str, language: Language) -> Vec<TodoItem>;
}

pub struct RegexParser { /* compiled regex, comment syntax map */ }
pub struct TreeSitterParser { /* grammar cache */ }
```

- `TodoItem` struct: file, line, column, tag, author (from comment), message, raw_line
- `Language` enum with comment syntax metadata

#### `cache` -- Scan caching

- Serializes/deserializes `ScanCache` via `bincode`
- mtime-based invalidation with xxHash verification
- Handles cache versioning and migration

#### `git` -- Git integration

- Shells out to `git` CLI (not libgit2 -- simpler, no linking issues)
- `blame(file, lines)` -> author/date per line
- `diff(base, head)` -> list of changed files + hunks
- `staged_diff()` -> diff of staged changes

#### `formatter` -- Output rendering

- `OutputFormatter` trait with `format(&self, results, writer)` method
- Each format is a separate struct implementing the trait
- Pretty formatter handles terminal width, colors, grouping
- JSON/SARIF formatters use `serde_json`

#### `config` -- Configuration management

- Loads from `.todo/config.toml` (project) merged with `$XDG_CONFIG_HOME/todo-tracker/config.toml` (global)
- Project config overrides global config
- CLI flags override both

### Data flow for `todo-tracker scan`

```
1. CLI parses args
2. Config loads (project + global + CLI overrides)
3. Cache loads (if exists and --no-cache not set)
4. Walker enumerates files (parallel, gitignore-aware)
5. For each file:
   a. Check cache: if mtime unchanged, use cached results
   b. Otherwise: read file, detect language, run parser
   c. Collect TodoItems
6. If --blame: run git blame on files with TODOs
7. Merge results, compute stats
8. Save cache
9. Format and write to stdout
```

### Data flow for `todo-tracker diff main..HEAD`

```
1. CLI parses args, extract base and head refs
2. Run git diff --name-only base..head
3. For changed files only:
   a. Get unified diff
   b. Parse added/removed lines for TODOs
4. Categorize: new TODOs (in + lines), resolved TODOs (in - lines)
5. Format and write to stdout
```

---

## Summary of Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | Rust | Performance, single binary, `ignore` crate, tree-sitter integration |
| Default parser | Regex with comment-syntax awareness | Fast, accurate enough for 95%+ cases |
| Tree-sitter | Opt-in flag | Higher accuracy when needed, larger binary |
| File walking | `ignore` crate (from ripgrep) | Production-proven parallel walker with gitignore support |
| Parallelism | `rayon` + `ignore::WalkParallel` | Lock-free work-stealing, scales to all cores |
| Cache format | bincode in `.todo/cache.bin` | Fast serialization, simple, no SQL overhead |
| Config format | TOML | Rust ecosystem standard, readable, good for project config |
| State location | `.todo/` directory in project root | Analogous to `.git/`, keeps state co-located |
| Output | Trait-based pluggable formatters | Easy to add new formats, clean separation |
| Git integration | Shell out to `git` CLI | Simpler than libgit2, no linking issues, works everywhere |
| Plugin system | Subprocess protocol (v2+) | Language-agnostic, secure, simple |
| CI integration | SARIF output + diff mode | Native GitHub/GitLab code scanning support |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| tree-sitter grammars increase binary size to 50MB+ | Medium | Medium | Ship grammars as optional download, not compiled in |
| `git blame` is too slow for large repos | High | Medium | Off by default, cached aggressively, batch per-file |
| Cache corruption causes stale results | Low | High | Version field + fallback to full rescan on any error |
| Regex false positives in string literals | Medium | Low | Document limitation, recommend tree-sitter mode for strict scanning |
| New language support requests overwhelm maintenance | Medium | Low | Comment syntax config is user-extensible via TOML |
