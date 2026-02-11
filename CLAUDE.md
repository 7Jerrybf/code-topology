# CLAUDE.md - Project Constitution: Code Topology

## 1. 願景與宣言 (Vision & Manifesto)

### 1.1 核心身份

* **專案名稱**: `code-topology`
* **定位**: The GPS for AI-Native Development. (AI 原生開發的導航系統)
* **終局目標**: 構建一個「雙引擎驅動」的協作作業系統，讓人類開發者與 AI Agent 在同一個語義拓撲圖上進行架構治理、衝突裁決與邏輯編排。

### 1.2 第一性原理 (First Principles)

1. **Map > Territory**: 在 AI 生成代碼的時代，代碼量將無限膨脹，人類無法閱讀所有代碼。**拓撲圖 (The Map)** 將取代文件與目錄，成為人類理解系統的主要介面。
2. **Governance by Physics**: 架構規範不應只是文字文件，而應是數位物理法則 (Digital Physics)。違反架構引力的代碼 (如循環依賴) 應在物理層面上難以被合併。
3. **Hybrid Intelligence**: 系統必須同時支援 **AST 的絕對真理 (Hard Logic)** 與 **向量的模糊意圖 (Soft Logic)**。

---

## 2. 系統架構 (System Architecture)

我們採用 **模組化單體 (Modular Monolith)** 架構，確保開源社群易於貢獻，同時保留未來拆分為微服務的彈性。

### 2.1 四層架構模型 (The 4-Layer Model)

| 層級 (Layer) | 模組名稱 | 職責 (Responsibilities) | 技術選型 |
| --- | --- | --- | --- |
| **L1: Core Engine** | `@topology/core` | AST 解析、Git 差異計算、依賴圖構建、插件加載器。 | Rust (未來優化) / TypeScript (目前), Tree-sitter |
| **L2: State & Sync** | `@topology/state` | 雙引擎數據同步、向量嵌入管理 (Embeddings)、圖資料庫介面。 | SQLite (Local), RxDB, pgvector (Cloud) |
| **L3: Server & API** | `@topology/server` | tRPC 路由、WebSocket 事件流、MCP (Model Context Protocol) 伺服器。 | Fastify, tRPC, MCP SDK |
| **L4: Interface** | `@topology/web` | 可視化畫布、IDE 插件橋接、決策工作台。 | Next.js, React Flow, Tauri (Desktop) |

### 2.2 雙引擎同步機制 (The Dual-Engine Protocol)

這是系統的核心護城河。所有數據流必須遵循此協議：

1. **Fast Lane (AST)**:
* 觸發：File Save / Git Commit。
* 處理：Tree-sitter 增量解析 -> 提取 Import/Export -> 生成 `HardLink`。
* 延遲：< 50ms。
* 結果：**實線連接** (確定的依賴)。


2. **Slow Lane (Vector)**:
* 觸發：Debounced Edit / Agent Proposal。
* 處理：Code Chunking -> Embedding Model (e.g., OpenAI/Voyage) -> Vector Search。
* 延遲：200ms - 2s。
* 結果：**虛線連接** (潛在的語義關聯、衝突預警)。



---

## 3. 技術堆疊與標準 (Tech Stack & Standards)

### 3.1 基礎設施

* **Repo**: Turborepo (高效構建緩存)。
* **Language**: TypeScript 5.x (Strict Mode).
* **Schema**: Zod (Runtime Validation) + Protocol Buffers (未來跨語言通訊)。

### 3.2 關鍵依賴

* **Parsing**: `tree-sitter` (支援多語言擴展的關鍵)。
* **Git**: `isomorphic-git` (純 JS Git 操作，無原生 git 依賴)。
* **Graph**: `graphology` (圖算法庫), `elkjs` (佈局算法)。
* **Vector**: `chromadb` (本地開發) / `pinecone` (雲端適配)。
* **Agent Interface**: `langchain` / `model-context-protocol` (MCP, 讓 Claude/ChatGPT 能直接操作拓撲圖)。

---

## 4. 數據契約 (Data Contracts)

為了支援開源生態，數據結構必須標準化。

### 4.1 節點定義 (The Node Protocol)

```typescript
// packages/protocol/src/node.ts

export const NodeSchema = z.object({
  id: z.string(), // URI: file://src/auth/login.ts#LoginFunction
  kind: z.enum(['FILE', 'MODULE', 'CLASS', 'FUNCTION', 'INTERFACE']),
  
  // 雙引擎屬性
  astMetadata: z.object({
    loc: z.object({ start: z.number(), end: z.number() }),
    signature: z.string(), // 函數簽名 Hash
  }),
  vectorEmbedding: z.array(z.number()).optional(), // 384/1536 dim
  
  // 協作狀態
  status: z.enum(['STABLE', 'DRAFT', 'CONFLICT', 'DEPRECATED']),
  lockedBy: z.string().optional(), // Agent ID or User ID
});

```

### 4.2 意圖與衝突 (Intent & Conflict)

```typescript
// packages/protocol/src/intent.ts

export const IntentSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  description: z.string(), // "Refactoring Auth to use JWT"
  affectedNodes: z.array(z.string()), // 預期修改的節點 ID
  vector: z.array(z.number()), // 意圖的語義向量
});

// 衝突裁決請求
export const ArbitrationRequestSchema = z.object({
  conflictId: z.string(),
  contenders: z.array(IntentSchema), // A方案 vs B方案
  contextGraph: z.any(), // 衝突點周圍的 Subgraph
});

```

---

## 5. 開源插件系統 (Plugin System)

為了讓社群貢獻（支援 Python, Go, Java 或自定義規範），核心必須是可擴展的。

* **Language Plugins**: 提供特定語言的 Tree-sitter 查詢語法 (Query `scm` files)。
* **Rule Plugins**: 定義架構規則 (Linting via Graph)。
* *Example*: `no-circular-dependency`, `layer-isolation (Controller cannot import DB)`.



---

## 6. 當前專案結構 (Current Project Structure)

```
code-topology/
├── packages/
│   ├── protocol/          # @topology/protocol - Zod schemas, 共享型別 (Single Source of Truth)
│   ├── core/              # @topology/core - L1: AST 解析, Git diff, 圖構建, 插件系統
│   │   └── src/
│   │       ├── parser/    # Tree-sitter 多語言解析 (TS/JS/Python)
│   │       ├── graph/     # 拓撲圖構建 & 快照管理
│   │       ├── git/       # Git 差異分析
│   │       ├── cache/     # SQLite 緩存 (ParseCache + EmbeddingCache)
│   │       ├── embedding/ # 本地向量嵌入 (ONNX Runtime + BERT tokenizer)
│   │       ├── reporter/  # 報告生成 (Markdown/JSON)
│   │       ├── plugins/   # 語言插件系統 + built-in plugins
│   │       └── analyze.ts # 高階分析 API (AST + Semantic 雙引擎)
│   ├── server/            # @topology/server - L3: WebSocket 伺服器, 檔案監視
│   └── web/               # @topology/web - L4: Next.js + React Flow + elkjs 視覺化
├── cli/                   # @topology/cli - 薄殼 CLI (commander → core + server)
├── plugins/               # 自定義插件目錄（預留）
├── turbo.json             # Turborepo 構建配置
├── pnpm-workspace.yaml    # Workspace: cli + packages/*
├── tsconfig.base.json     # 共享 TypeScript 配置
└── CLAUDE.md
```

**Build DAG**: `protocol` → `core` → `server` → `cli` / `web`

**關鍵技術**:
- **佈局引擎**: elkjs (取代 dagre)
- **Schema 驗證**: Zod (runtime validation)
- **構建工具**: Turborepo (增量構建緩存)
- **插件系統**: LanguagePlugin interface + pluginRegistry
- **向量引擎**: onnxruntime-node + Xenova/all-MiniLM-L6-v2 (384 維, int8 量化)
- **本地緩存**: better-sqlite3 (ParseCache + EmbeddingCache)

---

## 7. 開發路線圖 (Master Roadmap)

### Phase 1: The "Viewer" (MVP / Open Source Foundation) ✅

* [x] Monorepo setup with Turborepo.
* [x] `@topology/protocol`: Zod schemas 作為 Single Source of Truth。
* [x] `@topology/core`: 實作 TypeScript/JavaScript/Python AST 解析與依賴圖生成。
* [x] `@topology/server`: WebSocket 即時更新 + 檔案監視。
* [x] `@topology/web`: 基於 React Flow + elkjs 的可視化，支援搜尋、篩選、時間軸。
* [x] 基礎插件系統 (LanguagePlugin interface)。
* [x] CLI 工具：analyze（生成 JSON）+ watch（即時更新）+ report（Markdown/JSON）。

### Phase 2: The "Monitor" (Dual Engine Integration) ✅

* [x] 接入 `isomorphic-git` 取代 `simple-git`，消除原生 git CLI 依賴。
* [x] 實作 `GitWatcher`：監聽 `.git/` 目錄偵測 commit、branch switch、merge、rebase 等事件。
* [x] 新增 `git_event` WebSocket 訊息類型，前後端完整串接。
* [x] 修復副檔名過濾 bug：`isTypeScriptFile()` → `isSupportedFile()`，支援所有 7 種副檔名。
* [x] 實作 SQLite 本地緩存（`CacheDb` + `ParseCache`），儲存解析結果與 embedding 向量。
* [x] **Vector Integration**: 實作本地 Embedding 生成（`onnxruntime-node` + `Xenova/all-MiniLM-L6-v2` 量化模型），實現「語義關聯」紫色虛線。
  * 純 TypeScript BERT WordPiece tokenizer（無外部依賴）
  * 自動從 HuggingFace 下載模型至 `.topology/models/`
  * Mean pooling + L2 normalization → 384 維向量
  * 餘弦相似度 > 0.7 且無直接 import 關係時產生語義邊
  * EmbeddingCache（SQLite）支援增量更新
  * CLI: `--no-embeddings` / `--similarity-threshold`
  * Web UI: 紫色虛線渲染 + toggle 開關 + sidebar Similar Files

### Phase 3: The "Arbiter" (Agent Interaction)

* [ ] 實作 MCP Server：讓 Cursor/Claude 可以讀取拓撲圖數據。
* [ ] 實作「衝突預警」：當兩個 Git 分支修改了語義相近的節點時，UI 發出警報。
* [ ] 推出 Docker Image，支援團隊私有化部署。

### Phase 4: The "Governor" (Enterprise/SaaS)

* [ ] 權限管理 (RBAC) 與審計日誌。
* [ ] Cloud Vector DB 同步。
* [ ] Custom Rule Builder (視覺化定義架構規則)。

---

## 8. 貢獻指南概要 (Contribution Guidelines)

* **Branching Strategy**: Trunk-based development. Feature branches merge to `main`.
* **Commit Message**: Conventional Commits (`feat:`, `fix:`, `chore:`).
* **Testing**:
* Unit Tests (Vitest) for all Core logic.
* E2E Tests (Playwright) for Web UI.
* **Snapshot Testing**: 對於 AST 解析結果，必須包含 Snapshot 測試以防回歸 (Regression)。



---

## 9. 給 AI Agent 的指令 (System Prompt for Copilot/Cursor)

> **Context**: You are working on `code-topology`, an open-source architectural visualization platform.
> **Constraint**:
> 1. Always prioritize **Schema Consistency**. Check `packages/protocol` before modifying data structures.
> 2. Think in **Graphs**. When adding a feature, ask: "How does this affect the dependency graph?"
> 3. **Performance**: We handle repositories with 10k+ files. Avoid O(N^2) algorithms in the hot path (AST parsing). Use caching whenever possible.
> 4. **Modularity**: Keep the Core logic decoupled from the UI. The Core should be able to run in a headless CI environment.
> 
> 
