# Shopify Smart Search

AI-powered product search app for Shopify. Provides a modern search widget on your storefront with RAG (Retrieval-Augmented Generation) for smart product discovery, and a full merchant dashboard for configuration.

## Features

- **AI-Powered Search** — Natural language product search using vector similarity (Qdrant) + LLM generation (Gemini / ChatGPT)
- **Image Search** — Upload a product image to find similar items via Shopify CDN + AI vision
- **Streaming Responses** — Real-time SSE streaming for instant search results
- **Merchant Dashboard** — Embedded Shopify admin panel (React + Polaris) to configure search widget, manage API keys, upload knowledge base, and view analytics
- **Shopify OAuth** — Full OAuth 2.0 flow with JWT verification, HMAC validation, and encrypted token storage
- **Auto Product Sync** — Products automatically sync to Qdrant vector store via webhooks + scheduled cron job
- **Knowledge Base** — Upload Excel Q&A files to supplement product search with custom answers
- **Per-Shop AI Keys** — Each merchant configures their own Gemini or ChatGPT key
- **Cross-Tab Session Persistence** — BroadcastChannel handshake keeps guest sessions alive across tabs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js / Express (ES modules) |
| **Dashboard** | React 19 + TypeScript + Vite + Shopify Polaris + App Bridge v4 |
| **Widget** | React IIFE bundle injected via Shopify ScriptTag |
| **Database** | PostgreSQL |
| **Vector DB** | Qdrant (Docker) |
| **AI** | OpenAI (embeddings + GPT-4o-mini) · Google Gemini 2.0 Flash |
| **Auth** | Shopify OAuth 2.0 + JWT + HMAC |

## Prerequisites

- Node.js 18+
- PostgreSQL (password: `1234` by default — see `.env.example`)
- Docker (for Qdrant)
- ngrok (for local Shopify development)
- Shopify Partner account with an app created

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
# Fill in all values — see .env.example for descriptions
```

Required variables:

| Variable | Description |
|----------|-------------|
| `SHOPIFY_API_KEY` | Shopify app API key (Partners Dashboard) |
| `SHOPIFY_API_SECRET` | Shopify app API secret |
| `VITE_SHOPIFY_API_KEY` | Same as SHOPIFY_API_KEY (for Vite dashboard) |
| `HOST` | Public HTTPS URL (ngrok in dev) |
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | 32-char random string for token encryption |
| `OPENAI_API_KEY` | OpenAI key (for embeddings/vector search) |
| `GEMINI_API_KEY` | Google Gemini key (optional, for image vision) |
| `QDRANT_URL` | Qdrant URL (default: `http://localhost:6333`) |
| `SCOPES` | Shopify OAuth scopes |

### 3. Start Qdrant

```bash
docker compose up -d
```

This starts Qdrant on port 6333 (HTTP) and 6334 (gRPC).

### 4. Initialize the database

```bash
npm run init-db
```

Creates `shops` and `product_embeddings` tables. Dashboard tables (`smartSearch_settings`, `display_settings`, `api_keys`, `knowledge_base`, `chat_sessions`, `chat_messages`) are auto-created on server start.

### 5. Start ngrok

```bash
ngrok http 3000
```

Copy the HTTPS URL to `HOST` in `.env`.

### 6. Run the app

```bash
npm run dev          # Backend + Vite dashboard dev server
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Backend + Vite dashboard (concurrently) |
| `npm run dev:watch` | Same with `--watch` on server.js |
| `npm run dev:server` | Backend only |
| `npm run dev:vite` | Vite dashboard only |
| `npm run build` | Build dashboard (`dashboard/dist/`) |
| `npm run build:widget` | Build storefront widget (`public/smart-search.js`) |
| `npm run init-db` | Create core DB tables |
| `npm run migrate-chat` | Migrate legacy chat tables |
| `npm run migrate-dashboard` | Migrate dashboard tables |
| `npm run check-db` | Diagnostic: show all DB state |
| `npm run clear-db` | Clear all PostgreSQL + Qdrant data |
| `npm start` | Production server |

## Database

### Schema

```
shops
├── id              SERIAL PRIMARY KEY
├── shop_domain     VARCHAR(255) UNIQUE NOT NULL
├── access_token    TEXT NOT NULL
├── scopes          TEXT DEFAULT ''
├── created_at      TIMESTAMP
└── updated_at      TIMESTAMP

product_embeddings
├── id                  SERIAL PRIMARY KEY
├── shop_domain         TEXT NOT NULL
├── product_id          TEXT NOT NULL
├── shopify_product_id  BIGINT
├── chunk_count         INTEGER DEFAULT 1
├── metadata            JSONB DEFAULT '{}'
├── embedded_at         TIMESTAMPTZ
└── UNIQUE (shop_domain, product_id)

smartSearch_settings
├── shop                  TEXT PRIMARY KEY
├── name                  TEXT DEFAULT 'Smart Search'
├── welcome_message       TEXT
├── primary_color         TEXT DEFAULT '#6366f1'
├── bubble_position       TEXT DEFAULT 'bottom-right'
├── logo_url              TEXT
├── tone_of_voice         TEXT DEFAULT 'friendly'
├── image_upload_enabled  BOOLEAN DEFAULT TRUE
├── active_api_key_id     TEXT
├── brand_name            TEXT DEFAULT 'Smart Search'
├── shop_description      TEXT
├── fallback_message      TEXT
└── updated_at            TIMESTAMPTZ

display_settings
├── shop             TEXT PRIMARY KEY
├── enabled          BOOLEAN DEFAULT TRUE
├── display_on       TEXT DEFAULT 'all'
├── mobile_visible   BOOLEAN DEFAULT TRUE
└── updated_at       TIMESTAMPTZ

api_keys
├── id             TEXT PRIMARY KEY (UUID)
├── shop           TEXT NOT NULL
├── provider       TEXT NOT NULL ('gemini' | 'chatgpt')
├── label          TEXT NOT NULL
├── encrypted_key  TEXT NOT NULL
├── masked_key     TEXT NOT NULL
└── created_at     TIMESTAMPTZ

knowledge_base
├── id          TEXT PRIMARY KEY (UUID)
├── shop        TEXT NOT NULL
├── type        TEXT DEFAULT 'file'
├── title       TEXT NOT NULL
├── url         TEXT
├── file_path   TEXT
├── status      TEXT DEFAULT 'processing'
└── uploaded_at TIMESTAMPTZ

chat_sessions
├── id              TEXT PRIMARY KEY (UUID)
├── shop            TEXT NOT NULL
├── customer_id     TEXT
├── guest_name      TEXT
├── guest_email     TEXT
├── user_type       TEXT DEFAULT 'guest'
├── started_at      TIMESTAMPTZ
└── last_message_at TIMESTAMPTZ

chat_messages
├── id          TEXT PRIMARY KEY (UUID)
├── session_id  TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE
├── role        TEXT NOT NULL ('user' | 'assistant')
├── content     TEXT NOT NULL
├── image_url   TEXT
└── sent_at     TIMESTAMPTZ
```

**Qdrant collection:** `shopify_products` with 1536-dim vectors, indexed on `shop_domain`, `product_id`, `vendor`, `product_type`, `tags`, `available`.

### Clean / Reset Database

```bash
# Drop all tables and recreate
node -e "
import pool from './config/database.js';
const tables = ['chat_messages','chat_sessions','api_keys','knowledge_base','smartSearch_settings','display_settings','product_embeddings','shops'];
for (const t of tables) await pool.query('DROP TABLE IF EXISTS \"' + t + '\" CASCADE');
console.log('All tables dropped.');
await pool.end();
"
npm run init-db
# Dashboard tables auto-create on next server start
```

## API Endpoints

### Public (Widget)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/smart-search-widget.js` | Compiled search widget JS (injected via ScriptTag) |
| GET | `/api/widget/settings?shop=` | Widget display/search settings |
| POST | `/api/chat/rag` | RAG streaming search (SSE) |
| POST | `/api/chat/widget` | Image upload + AI search |
| POST | `/api/search/products` | Direct product search |
| GET | `/api/rag/health` | RAG system health check |
| GET | `/health` | Server health check |

### Protected (Dashboard — requires Shopify JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Dashboard overview stats |
| GET/POST | `/api/smart-search/settings` | Search widget configuration |
| POST | `/api/smart-search/logo` | Upload widget logo (multipart) |
| GET/POST | `/api/display-settings` | Widget display rules |
| GET/POST/DELETE | `/api/knowledge-base` | Knowledge base management |
| POST | `/api/knowledge-base/upload` | Upload knowledge file |
| GET/POST/DELETE | `/api/api-keys` | AI API key management |
| GET | `/api/users/guests` | Guest user list |
| GET | `/api/users/registered` | Registered user list |
| GET | `/api/users/sessions/:id/messages` | Search session messages |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth` | Start OAuth flow |
| GET | `/auth/callback` | OAuth callback |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/app-uninstalled` | App uninstall cleanup |
| POST | `/webhooks/products-create` | Product created → sync |
| POST | `/webhooks/products-update` | Product updated → sync |
| POST | `/webhooks/products-delete` | Product deleted → remove |

## Project Structure

```
├── server.js                  # Express app entry point
├── config/
│   ├── database.js            # PostgreSQL pool
│   ├── dashboard-db.js        # Dashboard schema + CRUD
│   └── rag.js                 # RAG config (embedding model, topK, etc.)
├── routes/
│   ├── auth.js                # OAuth flow + post-install setup
│   ├── api.js                 # Public product/shop API
│   ├── chat.js                # Gemini + MCP tool-calling search
│   ├── chat-simple.js         # Gemini search (no MCP)
│   ├── chat-rag.js            # RAG search: Qdrant → LLM streaming
│   ├── dashboard.js           # Merchant dashboard API
│   ├── admin-rag.js           # Admin RAG sync endpoints
│   └── webhooks.js            # Shopify webhook handlers
├── services/
│   ├── aiChat.js              # AI response generation (Gemini/ChatGPT)
│   ├── embeddings.js          # OpenAI embeddings with retry
│   ├── vector-store.js        # Qdrant collection management
│   ├── product-sync.js        # Shopify → Qdrant sync pipeline
│   ├── scriptTag.js           # Shopify ScriptTag management
│   ├── shopifyFiles.js        # Shopify CDN file upload
│   ├── gemini.js              # Gemini streaming with function calls
│   ├── mcp-client.js          # Shopify MCP client
│   ├── chat.js                # Chat/search service
│   └── streaming.js           # SSE streaming utilities
├── middleware/
│   └── session.js             # JWT verification for dashboard
├── utils/
│   └── crypto.js              # Token encryption helpers
├── scripts/
│   ├── init-db.js             # Create core tables
│   ├── check-db.js            # DB diagnostic tool
│   ├── migrate-chat-tables.js # Search session table migration
│   └── migrate-dashboard.js   # Dashboard table migration
├── jobs/
│   └── sync-scheduler.js      # Cron-based product sync
├── dashboard/                 # React + TypeScript merchant dashboard
│   ├── vite.config.ts
│   └── src/
├── widget/                    # React storefront search widget
│   ├── vite.widget.config.ts
│   ├── index.tsx              # IIFE entry point
│   ├── ChatWidget.tsx         # Root widget component (SearchWidget)
│   └── components/
│       ├── SearchBubble.tsx   # Floating search button (magnifying glass)
│       ├── SearchPanel.tsx    # Full search panel with results
│       └── GuestGate.tsx      # Guest registration form
├── public/
│   └── smartSearch.js             # Built widget output
├── docker-compose.yml         # Qdrant container
└── .env.example               # Environment variable template
```

## Architecture Notes

- **dotenv must be the first import** in server.js — ES module imports are hoisted
- **Embeddings**: OpenAI `text-embedding-3-small` (1536-dim) with retry logic
- **Shop isolation**: Every Qdrant query filters by `shop_domain`; post-query validation provides defense in depth
- **CORS split**: Widget paths get open CORS (`origin: *`), dashboard paths get credentialed CORS
- **ScriptTag auto-cleanup**: `registerScriptTag()` removes stale tags pointing to old URLs before registering new ones
- **AI keys are per-shop**: Each merchant configures their own Gemini or ChatGPT API key via the dashboard. No hardcoded fallback — if not configured, the search widget shows an error message
- **Webhook route order matters**: Webhooks must register before the JSON body parser (raw body needed for HMAC verification)

## Authentication Flow

```
Store Admin clicks "Install App"
        │
        ▼
GET /auth?shop=store.myshopify.com
        │
        ├── New install → Build OAuth URL → Redirect to Shopify consent screen
        │                                         │
        │                               User approves scopes
        │                                         │
        │                               GET /auth/callback
        │                                         │
        │                               ├── Verify HMAC + nonce
        │                               ├── Exchange code for access_token
        │                               ├── Encrypt & store token in PostgreSQL
        │                               ├── Register webhooks
        │                               ├── Register ScriptTag (widget)
        │                               └── Redirect to dashboard
        │
        └── Existing install → Verify JWT → Serve dashboard
```

**Key security measures:**
1. HMAC validation on every OAuth callback
2. Nonce (CSRF) verification for OAuth flow
3. JWT verification for all dashboard API calls
4. Access tokens encrypted at rest (Cryptr + ENCRYPTION_KEY)
5. Webhook HMAC verification using raw request body

## Search Flow (RAG)

```
User types "red shoes under $50"
        │
        ▼
POST /api/chat/rag (SSE stream)
        │
        ├── Detect query type (greeting / product / knowledge)
        ├── Rewrite follow-up queries using conversation history
        │
        ├── Parallel search:
        │   ├── Qdrant vector search (product embeddings)
        │   └── Knowledge base search
        │
        ├── Build context from top results
        ├── Stream AI response (Gemini or ChatGPT)
        │
        └── SSE events:
            ├── session_id → session tracking
            ├── chunk → streamed text tokens
            ├── products → matching product cards
            └── similar_products → "you might also like"
```

## Deployment

### Production Checklist

1. Set `NODE_ENV=production`
2. Update `HOST` to your production HTTPS URL
3. Set a strong random `ENCRYPTION_KEY` (32 chars)
4. Update Shopify app URLs in Partners Dashboard
5. Build the dashboard: `npm run build`
6. Build the widget: `npm run build:widget`
7. Ensure Qdrant is accessible at `QDRANT_URL`
8. Run database migrations: `npm run init-db && npm run migrate-dashboard`

### Docker (Qdrant)

```bash
docker compose up -d   # Start Qdrant on ports 6333/6334
docker compose down    # Stop and remove container
```
