# FIELDLEDGER build and readiness · 27 September 2026

Six contracts are pinned to `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` on Studio Dev 61997. The repository contains Next.js App Router, Cloudflare Worker/R2 evidence gateway and verified indexer, Supabase migrations/RLS, versioned policies, multi-party synthetic scenarios, source adapters and deployment/recovery scripts.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | Pass: typecheck, 46 Vitest tests, Next production build, contract Python compile |
| `npm run test:e2e` | Pass: synthetic preview, register, detail, mobile viewport, browser errors |
| `npm run test:live-ui` | Pass: configured app Auth and gateway read model with mocked account/API responses; no synthetic row |
| `.venv/bin/pytest -q tests/test_contracts.py` | 21 passed on real cached v0.6 runner with test-only older-gltest loader bridge |
| `genvm-lint contracts/*.py` | Six contracts passed |
| Studio Dev RPC | Deployed contracts, registrations, agreements, event challenge and evidence commitments verified; live determination, appeal and child delivery remain outstanding |
| Vercel production | `fieldledger` project deployed and ready at [fieldledger-sage.vercel.app](https://fieldledger-sage.vercel.app); live page returned HTTP 200 |
| Cloudflare CORS | Production Worker deployed with the Vercel origin; preflight returned the matching `Access-Control-Allow-Origin` header |

## Remaining owner and network work

The Supabase project, R2 bucket, Cloudflare Worker, six Studio Dev contracts and Vercel frontend are deployed. The remaining live work is to complete fee measurements and the multi-party determination, appeal, child-delivery/recovery and per-agreement effects after the event deadline, then enable writes only when the measured profile passes its gate. Exact commands and order are in `docs/DEPLOYMENT.md`. `docs/READINESS.md` and `docs/HOSTILE_AUDIT.md` record the remaining gates. `ENFORCE` writes an entitlement record, with `paid:false`; payment and ERP posting are outside this version.
