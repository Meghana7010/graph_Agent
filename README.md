# O2C Graph Explorer

> Interactive knowledge graph for SAP Order-to-Cash data, powered by Groq AI

**React + Node.js + SQLite + Groq · SAP Order-to-Cash Dataset**

---

## Overview

The O2C Graph Explorer transforms a flat SAP Order-to-Cash dataset (21,393 records across 19 entity types) into an interactive, AI-queryable knowledge graph. Users explore the data visually through a D3 force-directed graph and interrogate it in plain English through a chat interface powered by Groq.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Vite |
| **Graph render** | D3.js v7 force simulation |
| **Backend** | Node.js + Express |
| **Database** | sql.js (SQLite WASM) |
| **AI layer** | Groq (`llama-3.3-70b-versatile`) |
| **Data format** | JSONL → SQLite |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A [Groq API key](https://console.groq.com/)

### Installation

```bash
git clone https://github.com/your-org/o2c-graph-explorer.git
cd o2c-graph-explorer
npm install
```

### Configuration

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and add your key:

```
GROQ_API_KEY=your_key_here
```

### Run

```bash
npm run dev
```

This starts both the Express server (port 3001) and the Vite client concurrently.

---

## Repository Structure

```
o2c-app/
├── server/
│   ├── index.js          ← Express server, SQLite init, Groq proxy
│   ├── data/
│   │   └── sap_data.json ← All 21,393 SAP records (19 tables)
│   ├── .env              ← GROQ_API_KEY (not in source control)
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx           ← Layout, data fetching, highlight state
│   │   ├── App.css           ← Full design system (CSS variables)
│   │   └── components/
│   │       ├── GraphView.jsx   ← D3 force simulation, node/edge render
│   │       ├── ChatPanel.jsx   ← Conversation UI, SQL display, results table
│   │       ├── TopBar.jsx      ← Breadcrumb, node/edge counts
│   │       └── LegendPanel.jsx ← Entity colour key
│   └── vite.config.js    ← Proxy /api → localhost:3001
└── package.json          ← Root scripts (concurrently dev + client)
```

---

## Architecture

### Three-tier design

- **Data tier** — 19 JSONL entity types loaded into an in-memory SQLite database at server startup.
- **API tier** — Express server exposing graph topology, raw SQL execution, and an AI chat proxy.
- **Presentation tier** — React + Vite SPA rendering the D3 graph and chat panel side-by-side.

### Why SQLite?

- **Zero-install deployment.** sql.js compiles SQLite to WebAssembly and runs entirely inside the Node.js process — no separate database server required.
- **The data is relational, not deeply connected.** The O2C dataset has well-defined foreign keys. SQL JOINs express these relationships naturally.
- **LLMs are excellent at SQL.** Natural-language-to-SQL translation accuracy is a core feature of the product; SQL is the best-supported query language for this use case.

All 21,393 records load into memory at startup (~2–3 seconds). Queries against even the largest table (16,723 rows) execute in under 5 ms.

### AI / Groq integration

The system prompt sent to Groq has four sections:

| Section | Purpose |
|---|---|
| Output contract | Forces deterministic JSON output on every call |
| SQL rules | Prevents common SQLite dialect errors |
| Relationship map | Enables multi-table JOINs without hallucinating column names |
| Full schema | Gives the model the ground truth needed to generate valid SQL |

Groq returns a single JSON envelope:

```json
{
  "sql": "SELECT ...",
  "answer": "Natural language answer based on query results",
  "highlight_ids": ["table_name::primary_key_value"]
}
```

The server executes the SQL independently and can verify results. The `answer` field is a human-readable interpretation — not the authoritative data source. If the SQL fails or returns no rows, the server reports that faithfully.

Full conversation history is sent on every request, enabling follow-up questions like *"now filter that to April only"* to resolve correctly.

---

## Security

- The Groq API key is stored in `server/.env` and is **never sent to the client**.
- The React frontend has no direct knowledge of the Groq API or key — it communicates only with the local Express server.
- The database is read-only in-memory. No `UPDATE`, `DELETE`, or `DROP TABLE` statements are issued anywhere. Any destructive SQL hallucinated by the model will silently fail.
- SQL errors are caught server-side; the API returns an empty rows array rather than a 500.
- `.env` is excluded from source control via `.gitignore`.

---

## Graph Visualisation

The D3 force simulation is tuned for the ~378-node O2C graph:

| Parameter | Value |
|---|---|
| Link distance | 80 px |
| Link strength | 0.3 |
| Many-body strength | −120 |
| Collision radius | node radius + 4 px |
| Alpha decay | D3 default (0.0228) |

When Groq returns `highlight_ids`, matching nodes enlarge and glow for 8 seconds, then restore to their default appearance. Highlight state is applied via direct D3 selection references, bypassing React re-renders for performance.

---

## Extension Points

**Swap SQLite for PostgreSQL** — Replace the sql.js init block with a `pg` Pool, change `db.exec(sql)` to `pool.query(sql)`. The prompting strategy, graph endpoint, and React frontend require no changes.

**Add graph filtering** — Pass `?entity=sales_order_headers&id=740507` to `/api/graph` to scope the view to a single entity and its two-hop neighbours.

**Streaming responses** — The Groq API supports server-sent events. Adding `stream: true` to the Groq call and piping through an SSE endpoint would allow answers to appear token-by-token.

**Tool use instead of JSON prompting** — Define a `run_sql` tool using Groq's tool_use feature to enforce the output schema at the API level and allow multi-step SQL reasoning in a single turn.

---

## License

MIT
