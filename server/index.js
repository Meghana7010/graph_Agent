import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Groq from "groq-sdk/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
try {
  const envFile = readFileSync(join(__dirname, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v) process.env[k.trim()] = v.trim();
  });
} catch {}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Load data & build SQLite DB ──────────────────────────────
const rawData = JSON.parse(readFileSync(join(__dirname, 'data.json'), 'utf8'));

let db;

function flattenRecord(rec) {
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [sk, sv] of Object.entries(v)) out[`${k}_${sk}`] = sv;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sqlType(val) {
  if (typeof val === 'number') return 'REAL';
  if (typeof val === 'boolean') return 'INTEGER';
  return 'TEXT';
}

async function initDB() {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  for (const [table, records] of Object.entries(rawData)) {
    if (!records.length) continue;

    const allKeys = new Set();
    records.slice(0, 20).forEach(r => Object.keys(flattenRecord(r)).forEach(k => allKeys.add(k)));
    const keys = [...allKeys];
    const flat0 = flattenRecord(records[0]);
    const colDefs = keys.map(k => `"${k}" ${sqlType(flat0[k])}`).join(', ');

    db.run(`CREATE TABLE IF NOT EXISTS "${table}" (${colDefs})`);

    const placeholders = keys.map(() => '?').join(', ');
    const stmt = db.prepare(
      `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})`
    );

    for (const rec of records) {
      const flat = flattenRecord(rec);
      const vals = keys.map(k => {
        const v = flat[k];
        if (v === undefined || v === null) return null;
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v;
      });
      try { stmt.run(vals); } catch {}
    }
    stmt.free();
  }

  console.log(`✅ SQLite ready — ${Object.keys(rawData).length} tables, ${Object.values(rawData).reduce((s, r) => s + r.length, 0).toLocaleString()} records`);
}

initDB();

// ─── Schema for system prompt ──────────────────────────────────
function getSchemaDescription() {
  return Object.entries(rawData)
    .filter(([, r]) => r.length)
    .map(([table, records]) => {
      const keys = [...new Set(records.slice(0, 5).flatMap(r => Object.keys(flattenRecord(r))))];
      return `Table "${table}": ${keys.join(', ')}`;
    })
    .join('\n');
}

const SYSTEM_PROMPT = `You are a Graph Agent analyzing an SAP Order-to-Cash (O2C) dataset stored in SQLite.
When users ask questions, respond ONLY with a valid JSON object in this exact shape:
{
  "sql": "SELECT ...",
  "answer": "Natural language answer based on query results",
  "highlight_ids": ["table_name::primary_key_value"]
}

Rules:
- Output ONLY the JSON object. No markdown, no explanation outside the JSON.
- Use standard SQLite syntax. Wrap column names in double quotes if they have camelCase.
- Limit results to 20 rows max.
- "highlight_ids" references graph nodes: format is "table::pk_value" (max 10 ids).
  Valid tables for highlights: sales_order_headers (pk: salesOrder), billing_document_headers (pk: billingDocument),
  journal_entry_items_accounts_receivable (pk: accountingDocument), payments_accounts_receivable (pk: accountingDocument),
  outbound_delivery_headers (pk: deliveryDocument), business_partners (pk: businessPartner), products (pk: product).
- Key relationships:
  * billing_document_items.referenceSdDocument → sales_order_headers.salesOrder
  * billing_document_headers.accountingDocument → journal_entry_items_accounts_receivable.accountingDocument
  * outbound_delivery_items.referenceSdDocument → sales_order_headers.salesOrder  
  * payments_accounts_receivable.invoiceReference → billing_document_headers.billingDocument
  * sales_order_headers.soldToParty → business_partners.businessPartner
- For cancelled docs: billingDocumentIsCancelled = 1 (stored as integer)
- Amounts are stored as TEXT, use CAST(x AS REAL) for numeric comparisons.

Database schema:
${getSchemaDescription()}`;

// ─── Routes ───────────────────────────────────────────────────

app.post('/api/query', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB initializing, try again shortly' });
  try {
    const results = db.exec(req.body.sql);
    if (!results.length) return res.json({ columns: [], rows: [] });
    res.json({ columns: results[0].columns, rows: results[0].values });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'DB initializing, try again shortly' });
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY not set in server/.env' });
    }
  
    const { messages } = req.body;
  
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile", // free + powerful
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages
        ],
        temperature: 0,
      });
  
      const rawText = completion.choices?.[0]?.message?.content || "{}";
  
      let parsed;
      try {
        const clean = rawText.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch {
        return res.json({
          answer: rawText,
          sql: null,
          rows: [],
          columns: [],
          highlight_ids: []
        });
      }
  
      const { sql, answer, highlight_ids = [] } = parsed;
  
      let rows = [], columns = [];
  
      if (sql) {
        try {
          const results = db.exec(sql);
          if (results.length) {
            columns = results[0].columns;
            rows = results[0].values;
          }
        } catch (sqlErr) {
          console.error('SQL Error:', sqlErr.message, '\nSQL:', sql);
        }
      }
  
      res.json({ answer, sql, columns, rows, highlight_ids });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

app.get('/api/graph', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB initializing' });

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();

  const entityConfigs = [
    { table: 'sales_order_headers',                        pk: 'salesOrder',         label: 'salesOrder',         color: '#3b82f6', type: 'Sales Order',      limit: 80 },
    { table: 'billing_document_headers',                   pk: 'billingDocument',    label: 'billingDocument',    color: '#8b5cf6', type: 'Billing Doc',       limit: 80 },
    { table: 'journal_entry_items_accounts_receivable',    pk: 'accountingDocument', label: 'accountingDocument', color: '#f59e0b', type: 'Journal Entry',     limit: 60 },
    { table: 'payments_accounts_receivable',               pk: 'accountingDocument', label: 'accountingDocument', color: '#10b981', type: 'Payment',           limit: 60 },
    { table: 'outbound_delivery_headers',                  pk: 'deliveryDocument',   label: 'deliveryDocument',   color: '#ec4899', type: 'Delivery',          limit: 60 },
    { table: 'business_partners',                          pk: 'businessPartner',    label: 'businessPartner',    color: '#06b6d4', type: 'Business Partner',  limit: 10 },
    { table: 'products',                                   pk: 'product',            label: 'product',            color: '#f97316', type: 'Product',           limit: 30 },
  ];

  for (const cfg of entityConfigs) {
    try {
      const result = db.exec(`SELECT * FROM "${cfg.table}" LIMIT ${cfg.limit}`);
      if (!result.length) continue;
      const { columns, values } = result[0];
      for (const row of values) {
        const rec = Object.fromEntries(columns.map((c, i) => [c, row[i]]));
        const nid = `${cfg.table}::${rec[cfg.pk]}`;
        if (!nodeIds.has(nid)) {
          nodeIds.add(nid);
          nodes.push({ id: nid, entity: cfg.table, entityType: cfg.type, entityId: String(rec[cfg.pk]), label: String(rec[cfg.label] ?? rec[cfg.pk]), color: cfg.color, data: rec });
        }
      }
    } catch {}
  }

  const addEdges = (sql, fn) => {
    try { const r = db.exec(sql); if (r.length) r[0].values.forEach(fn); } catch {}
  };

  addEdges(`SELECT billingDocument, accountingDocument FROM billing_document_headers WHERE accountingDocument IS NOT NULL`,
    ([bd, ad]) => {
      const s = `billing_document_headers::${bd}`, t = `journal_entry_items_accounts_receivable::${ad}`;
      if (nodeIds.has(s) && nodeIds.has(t)) edges.push({ source: s, target: t, type: 'has_journal_entry' });
    });

  addEdges(`SELECT DISTINCT billingDocument, referenceSdDocument FROM billing_document_items WHERE referenceSdDocument IS NOT NULL`,
    ([bd, so]) => {
      const s = `sales_order_headers::${so}`, t = `billing_document_headers::${bd}`;
      if (nodeIds.has(s) && nodeIds.has(t)) edges.push({ source: s, target: t, type: 'billed_as' });
    });

  addEdges(`SELECT DISTINCT deliveryDocument, referenceSdDocument FROM outbound_delivery_items WHERE referenceSdDocument IS NOT NULL`,
    ([dd, so]) => {
      const s = `sales_order_headers::${so}`, t = `outbound_delivery_headers::${dd}`;
      if (nodeIds.has(s) && nodeIds.has(t)) edges.push({ source: s, target: t, type: 'delivered_via' });
    });

  addEdges(`SELECT DISTINCT accountingDocument, invoiceReference FROM payments_accounts_receivable WHERE invoiceReference IS NOT NULL AND invoiceReference != ''`,
    ([pay, inv]) => {
      const s = `billing_document_headers::${inv}`, t = `payments_accounts_receivable::${pay}`;
      if (nodeIds.has(s) && nodeIds.has(t)) edges.push({ source: s, target: t, type: 'paid_via' });
    });

  addEdges(`SELECT salesOrder, soldToParty FROM sales_order_headers WHERE soldToParty IS NOT NULL`,
    ([so, bp]) => {
      const s = `business_partners::${bp}`, t = `sales_order_headers::${so}`;
      if (nodeIds.has(s) && nodeIds.has(t)) edges.push({ source: s, target: t, type: 'placed_order' });
    });

  res.json({ nodes, edges });
});

app.get('/api/schema', (req, res) => {
  const schema = {};
  for (const [table, records] of Object.entries(rawData)) {
    if (!records.length) continue;
    schema[table] = { count: records.length, columns: Object.keys(flattenRecord(records[0])) };
  }
  res.json(schema);
});

app.get('/api/health', (req, res) => res.json({ status: db ? 'ready' : 'initializing' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 O2C Server → http://localhost:${PORT}`));