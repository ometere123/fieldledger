# FIELDLEDGER

Operational-event determination and commercial assurance for oil and gas. One physical event receives a neutral GenLayer determination; several versioned agreements consume that same truth through deterministic, distinct policies. The Warri River reference workspace and all fixture names/data are **synthetic**.

## Run locally

```bash
npm ci
npm run check
npm run dev
```

Open `http://localhost:3000`. Before configuration the app displays a labelled synthetic preview. With deployed contracts, a measured fee profile, Supabase membership and a Worker endpoint, it uses the verified read model and signed GenLayer actions. It never treats a database row as canonical protocol state.

Six v0.6 runner-pinned contracts, a routed Next.js App Router UI, Cloudflare Worker/R2 gateway, Supabase migrations/RLS, source adapters, Direct Mode tests and deployment scripts are in this repository. Read [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), [deployment](docs/DEPLOYMENT.md), [targeted v3 changes](docs/V3_CHANGES.md), [hostile audit](docs/HOSTILE_AUDIT.md) and [readiness](docs/READINESS.md). Start from `.env.example`.

**Trust boundary:** GenLayer consensus decides semantic cause, responsible party, neutral duration and applicable rules from digest-verified independent evidence. The obligation engine computes ordinary arithmetic. `UNDETERMINED` blocks automatic enforcement. `OBSERVE` records without execution; `ENFORCE` records an entitlement but does not transfer funds or mark an invoice paid. Raw enterprise records remain in enterprise systems. Public adjudication packages are intentionally minimal; no confidential GenLayer computation is claimed.

The frontend is deployed to [fieldledger-sage.vercel.app](https://fieldledger-sage.vercel.app), with the production Worker CORS origin configured and verified. FIELDLEDGER is not yet end-to-end production verified: live determination, appeal, child delivery and obligation effects remain outstanding, and the browser refuses writes while the fee profile is unmeasured. See `docs/READINESS.md` for the exact gate.
