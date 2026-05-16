# Console Directory Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move terminal interface code from root `src/` to `console/` directory so the repo layout clearly distinguishes the console app from the mobile app.

**Architecture:** Simple git rename (`src/` → `console/`) with updated `package.json` scripts, `tsconfig.json` rootDir/include, and one test file import. No logic changes — this is purely a file-system and config update.

**Tech Stack:** Bun, TypeScript, Node16 module resolution

---

### Task 1: Rename `src/` to `console/`

**Files:**
- Rename: `src/` → `console/` (all files inside move together)

- [ ] **Step 1: Rename the directory**

```bash
git mv src console
```

Expected: Git tracks the rename. Run `git status` — should show all `src/*.ts` files renamed to `console/*.ts`.

- [ ] **Step 2: Verify directory exists and files are present**

```bash
ls console/
```

Expected: `cli.ts config.ts daemon.ts database-adapter.ts database.ts fetcher.ts hackernews-scraper.ts index.ts logger.ts logo.ts opml.ts parser.ts pinboard-scraper.ts scheduler.ts tui.ts types.ts`

- [ ] **Step 3: Commit the rename**

```bash
git add -A
git commit -m "refactor: rename src/ to console/ to clarify repo structure"
```

---

### Task 2: Update `package.json` build scripts

**Files:**
- Modify: `package.json`

The current `package.json` has scripts and a build command referencing `src/`:
- `"build": "bun build src/index.ts ..."`
- `"dev": "bun src/index.ts"`
- `"bun-direct": "bun src/index.ts"`

All `src/` references must become `console/`.

- [ ] **Step 1: Update package.json scripts**

In `package.json`, change every occurrence of `src/` to `console/` in the `scripts` object. The result:

```json
{
  "scripts": {
    "build": "bun build console/index.ts --outdir dist --target node --format esm --sourcemap --external better-sqlite3 --external rss-parser --external axios --external node-cron --external fast-xml-parser --external commander --external p-limit --external cheerio --external blessed || tsc",
    "dev": "bun console/index.ts",
    "start": "bun dist/index.js",
    "view": "bun dist/index.js view",
    "test": "bun test/database.test.ts",
    "cli": "bun dist/index.js",
    "bun-direct": "bun console/index.ts"
  }
}
```

- [ ] **Step 2: Verify the file looks right**

Open `package.json` and confirm no remaining `src/` references in the scripts block.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "refactor: update package.json scripts to use console/ directory"
```

---

### Task 3: Update `tsconfig.json`

**Files:**
- Modify: `tsconfig.json`

Current `tsconfig.json`:
```json
{
  "compilerOptions": {
    "rootDir": "./src",
    ...
  },
  "include": ["src/**/*"]
}
```

Must become:
```json
{
  "compilerOptions": {
    "rootDir": "./console",
    ...
  },
  "include": ["console/**/*"]
}
```

- [ ] **Step 1: Update tsconfig.json**

Change `"rootDir": "./src"` to `"rootDir": "./console"` and `"include": ["src/**/*"]` to `"include": ["console/**/*"]`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./console",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["console/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 2: Commit**

```bash
git add tsconfig.json
git commit -m "refactor: update tsconfig.json to use console/ as rootDir"
```

---

### Task 4: Update test file import

**Files:**
- Modify: `test/database.test.ts`

Current line 1:
```typescript
import { database } from '../src/database.js';
```

Must become:
```typescript
import { database } from '../console/database.js';
```

- [ ] **Step 1: Update the import**

In `test/database.test.ts`, change `'../src/database.js'` to `'../console/database.js'`:

```typescript
import { database } from '../console/database.js';
import { unlinkSync, existsSync } from 'fs';
```

- [ ] **Step 2: Run the tests to confirm they pass**

```bash
bun test/database.test.ts
```

Expected: Tests pass (same behavior as before the rename).

- [ ] **Step 3: Commit**

```bash
git add test/database.test.ts
git commit -m "refactor: update test import to use console/ directory"
```

---

### Task 5: Verify build works end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Run the build**

```bash
bun run build
```

Expected: Build completes successfully, `dist/index.js` is updated.

- [ ] **Step 2: Smoke-test the built binary**

```bash
bun dist/index.js --help
```

Expected: Prints the fressh command help (Commander.js output) without errors.

- [ ] **Step 3: Commit any dist updates (optional)**

If the build output changed due to the rename, commit it:
```bash
git add dist/
git commit -m "build: rebuild dist after console/ rename" || echo "No dist changes to commit"
```
