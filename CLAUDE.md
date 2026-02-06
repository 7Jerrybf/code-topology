# AGENT.md - Project Specification: code-topology-mvp

## 1. 專案身份與目標 (Project Identity)

* **專案名稱**：`code-topology-mvp`
* **核心價值**：一個單機優先 (Local-First) 的可視化架構分析工具。
* **解決痛點**：協助開發者在本地透過 AST 拓撲圖，直觀看見代碼依賴關係，並在開發分支 (`feature`) 與主分支 (`main`) 合併前，視覺化地偵測潛在的邏輯斷裂。
* **開發哲學 (Solo Dev Manifesto)**：
* **KISS 原則**：不做資料庫、不做登入驗證、不做雲端部署。一切運行在 `localhost`。
* **視覺先行**：如果使用者看不見，該功能就不存在。
* **容錯性**：遇到無法解析的語法直接跳過，絕不讓工具崩潰。



---

## 2. 技術堆疊 (Tech Stack)

### Core (Language & Runtime)

* **Language**: TypeScript (Strict Mode).
* **Runtime**: Node.js (v20+).
* **Package Manager**: pnpm.

### Backend / CLI (The "Spine")

* **CLI Framework**: `commander` or `cac`.
* **Git Operations**: `simple-git` (用於讀取本地 git 狀態).
* **AST Parsing**: `tree-sitter` & `tree-sitter-typescript` (高效增量解析).
* **File System**: `fs/promises`, `glob`.

### Frontend / Visualization (The "Face")

* **Framework**: Next.js 14+ (App Router).
* **Visualization**: `React Flow` (處理拓撲圖核心).
* **Layout Algorithm**: `dagre` or `elkjs` (自動計算節點位置).
* **UI Components**: `shadcn/ui` (基於 Radix UI ). 避免使用默認Tailwind CSS樣式，可參考使用frontend skills
* **Icons**: `lucide-react`.
* **State Management**: `zustand` (如果需要跨組件狀態).

### AI Integration (The "Magic" - Phase 4)

* **SDK**: Google Generative AI SDK (Gemini) or OpenAI Node SDK.

---

## 3. 架構設計 (Architecture)

專案結構採用簡易的 Monorepo 風格：

```text
code-topology-mvp/
├── cli/                 # 後端邏輯：負責解析、Git 操作、生成 JSON
│   ├── src/
│   │   ├── analyzer/    # Tree-sitter 解析核心
│   │   ├── git/         # Git 差異比對邏輯
│   │   └── index.ts     # CLI 入口點
│   └── package.json
├── web/                 # 前端介面：負責讀取 JSON 並渲染圖形
│   ├── src/
│   │   ├── app/
│   │   ├── components/  # React Flow 自定義節點
│   │   └── hooks/
│   └── package.json
├── output/              # 暫存區：CLI 生成的 graph.json 存放在此
└── AGENT.md             # 本文件

```

### 資料流 (Data Flow)

1. **Trigger**: 使用者在終端機執行 `topology analyze`.
2. **Process**:
* CLI 掃描指定目錄。
* Tree-sitter 解析 `.ts/.tsx` 檔案，提取 `Imports` (依賴) 與 `Exports` (定義)。
* Simple-git 獲取當前分支與 `main` 的 Diff。


3. **Output**: 生成 `topology-data.json` 至 `web/public/data/` 或共享目錄。
4. **Visualize**: 使用者打開 `localhost:3000`，Next.js 讀取 JSON，React Flow 渲染圖形。

---

## 4. 核心資料結構 (Core Data Structures)

所有模組必須遵守此 Interface，確保 CLI 與 Web 端資料一致。

```typescript
// 節點類型：檔案或模組
type NodeType = 'FILE' | 'COMPONENT' | 'UTILITY';

// 變動狀態 (基於 Git Diff)
type DiffStatus = 'UNCHANGED' | 'ADDED' | 'MODIFIED' | 'DELETED';

interface TopologyNode {
  id: string;          // 檔案路徑 (e.g., "src/utils/auth.ts")
  label: string;       // 顯示名稱 (e.g., "auth.ts")
  type: NodeType;
  status: DiffStatus;  // 用於前端著色 (綠/黃/紅)
  astSignature: string; // 用於比對內容變化的 Hash 或簽名
}

interface TopologyEdge {
  id: string;
  source: string;      // 來源 Node ID (Importer)
  target: string;      // 目標 Node ID (Exporter)
  isBroken: boolean;   // 關鍵邏輯：如果 Target 改了簽名但 Source 沒改，則為 True
}

interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  timestamp: number;
}

```

---

## 5. 開發階段路徑圖 (Implementation Phases)

**目前階段：Phase 4 ✅ 完成**

### Phase 1: 骨架搭建與 AST 解析 (Week 1)

* [x] 初始化 Monorepo 與 TS 設定。 ✅ (2025-02-05)
  - pnpm workspace 設定完成
  - TypeScript strict mode 啟用
  - Git 初始化完成
* [x] 實作 CLI 骨架：`topology analyze` 命令可用。 ✅ (2025-02-05)
  - commander 整合完成
  - glob 掃描 `.ts/.tsx` 檔案邏輯就緒
* [x] 整合 Tree-sitter：能解析檔案並提取 `import x from 'y'` 關係。 ✅ (2025-02-05)
  - 支援 TypeScript 與 TSX 檔案
  - 解析 import 語句與 re-export (export from)
  - 處理 ESM `.js` 副檔名映射至 `.ts` 來源
  - Windows/Unix 路徑正規化
* [x] 輸出基礎 `topology-data.json`。 ✅ (2025-02-05)
  - 輸出至 `web/public/data/topology-data.json`
  - 測試結果：CLI codebase 產生 7 nodes, 7 edges

### Phase 2: 視覺化呈現 (Week 2)

* [x] 搭建 Next.js 環境。 ✅ (2025-02-05)
  - Next.js 15 + App Router
  - React Flow、dagre、zustand 依賴已安裝
* [x] 整合 React Flow：讀取 `topology-data.json` 並顯示節點。 ✅ (2025-02-05)
  - TopologyGraph 組件讀取 JSON 資料
  - TopologyNode 自訂節點樣式 (FILE/COMPONENT/UTILITY)
  - 邊線顯示依賴關係與箭頭
* [x] 整合 `dagre`：實現自動佈局，避免節點重疊。 ✅ (2025-02-05)
  - 階層式 Top-Bottom 佈局
  - 自動計算節點位置
* [x] 實作「點擊節點顯示詳情」的 Sidebar。 ✅ (2025-02-05)
  - 顯示 Type、Status、Hash
  - 顯示 Imports 與 Imported by 清單

### Phase 3: 差異比對與衝突模擬 (Week 3)

* [x] CLI 整合 `simple-git`。 ✅ (2025-02-05)
  - getGitDiff() 比對 HEAD 與 main/master
  - 自動偵測 base branch
  - `--base` 選項指定比對分支
  - `--no-git` 選項跳過 git 分析
* [x] 實作 AST Diff 邏輯：比對 `HEAD` 與 `main` 的 Export 簽名差異。 ✅ (2025-02-05)
  - 提取 export 簽名 (function, class, type, interface, variable)
  - 比對 export signature hash 偵測 breaking changes
  - 追蹤 changedExportFiles 集合
* [x] 更新 JSON 結構，加入 `status` 與 `isBroken` 欄位。 ✅ (2025-02-05)
  - nodes.status: UNCHANGED/ADDED/MODIFIED/DELETED
  - edges.isBroken: target exports 改變但 source 未更新
* [x] 前端實作視覺警示（紅色虛線、黃色節點）。 ✅ (2025-02-05)
  - MODIFIED 節點：黃色 ring
  - ADDED 節點：綠色 ring
  - DELETED 節點：紅色 ring + 透明度
  - isBroken 邊：紅色虛線 + 動畫

### Phase 4: AI 洞察 (Week 4)

* [x] 接入 LLM API。 ✅ (2026-02-06)
  - Google Generative AI SDK (Gemini) 整合完成
  - API Route `/api/explain` 處理 POST 請求
  - 環境變數 `GOOGLE_AI_API_KEY` 設定
* [x] 實作「Click-to-Explain」：將 Broken Edge 的兩端代碼送給 AI 解釋原因。 ✅ (2026-02-06)
  - 點擊紅色虛線 (broken edge) 觸發 AI 分析
  - ExplainModal 顯示三個區塊：What Changed / Why Breaking / How to Fix
  - 錯誤處理：NO_API_KEY / RATE_LIMIT / NETWORK_ERROR / FILE_NOT_FOUND
  - 複製分析結果功能

---

## 6. 編碼規範 (Coding Standards)

為了保持 MVP 的速度與品質，AI 在生成代碼時必須遵守：

1. **Error Handling**:
* 解析 AST 時若失敗，`console.warn` 並跳過該檔案，**絕對不要 throw error 導致 CLI 退出**。
* 前端若讀取不到 JSON，顯示友好的 "No Data Found" 頁面並提示使用者執行 CLI。


2. **Component Design**:
* React 組件必須是 Functional Components + Hooks。
* 所有的 UI 邏輯與樣式使用 `shadcn/ui` 不手寫 CSS。 避免使用默認Tailwind CSS樣式、藍紫配色，可參考使用frontend skills


3. **Simplicity**:
* **No Databases**: 資料全部存成 JSON 檔案。
* **No Auth**: 這是本地工具，不需要登入。
* **No Microservices**: CLI 與 Web 是分開的兩個 Process，透過檔案系統交換資料即可。


4. **Language**:
* 嚴格使用 TypeScript。
* 避免使用 `any`，除非是在處理 Tree-sitter 極端複雜的 AST 節點時可適度放寬，但必須加註解。



---

**End of AGENT.md**

---