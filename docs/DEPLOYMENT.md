# Deployment, reprovisioning and live verification

## 1. Install and local checks

```bash
npm ci
npm run check
npm run test:e2e
npm run test:live-ui
python3 -m venv .venv-v06
.venv-v06/bin/pip install -r requirements-genlayer-v06.txt
.venv-v06/bin/pytest -q tests/test_contracts.py
python3 -m compileall -q contracts
for f in contracts/*.py; do .venv-v06/bin/genvm-lint check "$f"; done
```

The isolated Python environment pins the matching GenLayer v0.6 prereleases. Configure the CLI explicitly and verify it before deployment:

```bash
genlayer network add studio-dev --base studionet --rpc https://studio-dev.genlayer.com/api --chain-id 61997
genlayer network set studio-dev
genlayer network info
```

The alias sets the Studio Dev RPC and chain ID; some CLI releases inherit consensus contract addresses from their base profile. Check deployed transactions in `https://explorer-studio-dev.genlayer.com/`. Never use Studionet's chain ID 61999 for this deployment. See [toolchain lock and rationale](TOOLCHAIN.md).

## 2. Supabase

Apply Supabase migrations in order: `001_init.sql`, `003_live_index.sql`, `004_evidence_capacity.sql`, then `005_worker_service_role_grants.sql`. `002_cron.sql` is an optional, commented pg_cron maintenance example. Enable Supabase Auth email/password or your organisation SSO. Create `organisations` rows only after onboarding checks and add `user_organisations` memberships with `viewer`, `preparer` or `signer` app roles. These app roles never substitute for the blockchain signer. The Worker holds the service role key; Vercel receives only URL and anon key. The service role receives only the explicit table privileges required by the gateway; app users read via authenticated Worker routes. Configure backups and retention for R2 and Postgres.

## 3. Cloudflare

The R2 bucket and Worker are deployed for Studio Dev. `ORGANISATION_HMAC_KEYS` and `INTERNAL_CRON_TOKEN` are Worker secrets. Keep `SUPABASE_URL` and `SUPABASE_ANON_KEY` as dashboard variables (project URL and `sb_publishable_...` key), and `SUPABASE_SERVICE_ROLE_KEY` as the `sb_secret_...` Worker secret. Deploy with `npm run worker:deploy`; its `--keep-vars` flag preserves dashboard-managed variables. The Worker sends modern secret keys only in `apikey`; it also accepts a legacy JWT `service_role` key. Never paste service keys into chat or commit them. The currently configured `ALLOWED_ORIGIN` is `https://fieldledger-sage.vercel.app`; a live preflight confirmed the matching CORS response. The 15-minute Cron Trigger reconciles finalized receipts and child messages. `POST /internal/reconcile` retries tracked receipts; `POST /internal/index` accepts one transaction hash and immediately runs the same finalized-receipt and chain-state verification. Both require `INTERNAL_CRON_TOKEN`; these are indexing/retry endpoints, never verdict setters. The user-created Vercel project `fieldledger` is intended to replace this origin after their manual deployment, with Root Directory `apps/web`. Restrict source system adapters to minimal facts; the returned digest URL must be publicly retrievable by validators.

## 4. Fee bootstrap and six-contract deployment

Use Studio Dev only: chain **61997**, RPC `https://studio-dev.genlayer.com/api`, explorer `https://explorer-studio-dev.genlayer.com/`. Keep private keys local. `scripts/profile-fees.mjs bootstrap` asks the network for policy and a quote, but its allocations remain **unmeasured**. Do not enable browser writes until representative fee measurements and successful live transaction flows have been recorded.

```bash
node scripts/profile-fees.mjs bootstrap
node scripts/protocol.mjs deploy
node scripts/protocol.mjs verify
```

Deployment order: ParticipantRegistry → AgreementRegistry → EventRegistry → EvidenceRegistry → EventConsensus → ObligationEngine → `EventRegistry.bind_consensus`. Set `GATEWAY_BASE_URL` before EvidenceRegistry deployment, ending in `/v1/evidence/`. Store `deployment.studio-dev.json` securely; it maps all six addresses. Studio reset: regenerate quote, redeploy in order, reseed, update Worker/Vercel address maps and reindex finalized receipts. Never transplant a previous chain's indexed FINALIZED rows as truth.

### Current Studio Dev state

The active map combines ParticipantRegistry and AgreementRegistry from generation 9 with EventRegistry, EvidenceRegistry, EventConsensus and ObligationEngine from generation 12; it is recorded in ignored local `deployment.studio-dev.json`. The network is the verified built-in `studio-dev` (chain 61997), RPC `https://studio-dev.genlayer.com/api`, and [Explorer Studio Dev](https://explorer-studio-dev.genlayer.com/). Its AgreementRegistry accepts 5–10,080 minute evidence windows. Generation-12 deployments and binding finalized with `FINISHED_WITH_RETURN`; ParticipantRegistry and the accepted five-minute AgreementRegistry are retained. Generations 1–11 are archived in the Worker. Active addresses and transaction hashes remain in the ignored local manifest. The gateway Worker and R2 bucket are deployed with active and archived maps; `/health` must be checked after any subsequent Worker deploy.

Four earlier `EventRegistry.bind_consensus` calls and two earlier `ParticipantRegistry.register` calls failed with `malformed_entry`. The Studio Dev Explorer exposes the failed entry bytes; they use a literal `method` map key, which matches the legacy encoder bundled in GenLayer CLI 0.40.0-rc2. GenVM v0.6 requires the method name under the empty key `""`. After upgrading to CLI 0.40.0-rc.3, selecting its built-in Studio Dev profile, and using its corrected encoder, `EventRegistry.bind_consensus` finalized with `FINISHED_WITH_RETURN` and 5/5 validator votes revealed. Explorer execution details show `SUCCESS` and a 250,000,000 wei storage charge; the settled receipt reports 78,628,250,000,823 wei spent from the 0.175 GEN deposit and a 174,921,371,750,111,971 wei refund. The successful call resolves the earlier encoding failure and binds the EventRegistry to EventConsensus. Corrected `ParticipantRegistry.register` calls for five organisations have finalized, and explorer search recovered all five hashes; the registry reads confirm distinct signers. The deployer transferred 0.25 GEN each to four counterparty wallets. Five synthetic agreement versions were proposed by the operator and independently accepted by their counterparties. Event `FL-2026-184` was opened by `OP-WR`, links all five agreements, and has a finalized `MNT-SP` envelope challenge that changed its type to `DISPUTED` while retaining bounded physical-event limits. Direct Mode tests, including the one-time binding test, pass. Studio Dev's `sim_call` rejects write simulations; official GenLayer docs describe that simulation API as localnet-only. The separate `gen_dbg_traceTransaction` method is unavailable, but Explorer's full consensus record provided the raw bytes needed for this diagnosis. Keep the browser fee profile unmeasured until representative successful methods and child/appeal fees are profiled.

An additional counterparty-originated smoke event, `FL-2026-185`, was opened by `MNT-SP` from signer account `party_a` under accepted agreement `MNT-2026-04:1` for `K-401B`. Transaction `0x81160ed77073b8c364c64b1e3c27e29b380e161d38e26279c0e1d6986a8291df` finalized with `FINISHED_WITH_RETURN`; the EventRegistry read confirms `originator: MNT-SP`, the single expected agreement link, and `closeAfter: 2026-09-29T07:47:45.619527Z`. Its 0.175000000000112794 GEN deposit settled with 0.000078633750000823 GEN spent and 0.174921366250111971 GEN refunded. The earlier same-ID transaction `0xeb7b3620994ea47007d7889786c93fbeb0c5b2538ea107a24b7ce041c5c55208` finalized with `FINISHED_WITH_ERROR` and made no state change: the GenLayer CLI `--args` parser interpreted JSON-looking text as a list although `open_event` expects a JSON-encoded string. This smoke test used a parser compatibility workaround that GenVM normalized before storage; use the GenLayer JS SDK for routine writes that need JSON-encoded string arguments.

## 5. Live fee and multi-party verification

The ignored local manifest contains synthetic scenarios through FL-2026-195. FL191 and FL193–FL194 completed three evidence commitments within 10-minute windows; FL195 completed two independent evidence commitments and close within a five-minute window. Validators disagreed during all these determinations. FL194's leader receipt contains a supported-looking maintenance deficiency outcome; FL195 used a utility interruption scenario. Neither has a canonical final result or indexed child. A shorter window speeds iteration but does not resolve live validator disagreement.

Three FL-2026-187 packages are synthetic fixtures in `fixtures/live/`; two are committed, and the third upload exists but no onchain inspection commitment was accepted. The current fee profile remains unmeasured and browser writes remain disabled. `node scripts/profile-fees.mjs quote-child` obtains current-price child-message budgets for `determine` and `redeliver`; this is a quote, not a measurement. The local GenLayer CLI keystore contains unlocked operator and counterparty accounts. `scripts/seed-flow.mjs` journals transaction hashes before waiting and resumes a prior submission; inspect the journal and chain receipt before retrying after a timeout. Hosted Studio Dev does not expose local simulator time controls: `sim_increase_time` / `sim_set_time` belong to local `glsim` ([GenLayer test simulator RPC](https://docs.genlayer.com/api-references/genlayer-test/glsim)), so allow real evidence windows to elapse.

`node scripts/profile-fees.mjs init-ledger` creates the ignored `fee-measurements.json` originally from 28 distinct finalized deployment, binding and live-method hashes; it refuses to overwrite a ledger. Add each future finalized receipt with its distinct scenario name. `node scripts/profile-fees.mjs account <hash>` is a read-only public RPC inspection and does not need a signer key. Six deployments, the successful `bind_consensus` call and 22 successful live app-method receipts are now present in the ledger; prior failed writes are excluded. The counterparty-originated receipt was appended as a distinct scenario. The bind consumed 78,628,250,000,000 execution units including 250,000,000 storage fee units; 78,628,250,000,823 wei was charged from a 0.175000000000112794 GEN deposit, and the remainder was refunded. `bootstrap` reproduces the 0.175000000000112794 GEN deposit quote using the observed allocations. These settled method samples establish a baseline for six method families only; they do not profile all app paths or child fees and must not enable browser writes. Complete the ledger with `claim`, `redeliver` and at least two distinct named scenarios each for `open_event`, `submit`, `determine` and `apply`. `node scripts/profile-fees.mjs measure fee-measurements.json` requires successful child delivery, an appealed determination, and fee-bearing finalized receipts. Independently confirm the appeal in the explorer; a round count alone is not cryptographic proof of appeal. Review measured consumption and refunds before enabling browser writes. Test an intentionally underfunded child, successful `redeliver`, duplicate apply, UNDETERMINED and the policy metrics with distinct wallets.


### Latest short live run: FL191

FL191 used accepted test agreement version 4 and a 10-minute evidence window. FL194 finalized three digest-verified commitments and the close inside ten minutes, then finalized determination without a canonical outcome. FL195–FL197 tested the five-minute limit and finalized evidence and close before their deadlines, but validators disagreed. Generation 10's external-source normalization and Generation 11's record-only clause normalization did not resolve this. FL197 exposed a decoded leader interval that did not match the cited evidence timestamps; the contract rejected it. Generation 12 derives an interval only from unambiguous cited timestamp facts and normalizes scalar wrappers. Its focused Direct Mode test and GenVM lint pass; live confirmation is pending on FL198. See `READINESS.md` for the receipts. Production agreements can still choose longer windows.
## 6. Vercel

The user created the Vercel project `fieldledger`; final project deployment and browser confirmation remain the user's manual step. Set Root Directory to `apps/web`; because the lockfile and package manifest live at the repository root, use install command `cd ../.. && npm ci` and build command `cd ../.. && npm run build`. Configure public variables `NEXT_PUBLIC_CONTRACTS_JSON`, `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The Supabase service-role key and signer keys must never be set in Vercel. After deployment, update the Worker's `ALLOWED_ORIGIN` to the new project origin and confirm the contract map points at generation 9. The prior `fieldledger-sage.vercel.app` origin is the current configured site, not evidence that the user-created `fieldledger` project has been deployed. Still verify sign-in, organisation membership, wallet 61997 guard, live fee quote, ACCEPTED, appeal, FINALIZED with successful execution, child delivery, multiple effects and audit export in the deployed browser.

### Contract generation cutover

`CONTRACTS_JSON` is the active generation used for new frontend writes and active contract reads. `CONTRACTS_ARCHIVE_JSON` is an optional JSON array of complete earlier address maps. The Worker checks every configured generation when reading an event, reconciling a transaction, verifying an appeal-history receipt or exporting a decision package. Historical maps are read-only for this routing. Repeated maps are deduplicated; if the same event ID exists in two distinct generations, lookup fails closed as ambiguous. For a new EventRegistry/Consensus generation, set the new map as active and preserve the previous full map in the archive array before deploying the Worker. Point Vercel's public contract map at the new active generation after review; retain the old map only in the Worker. Do not remove the archive until historical event and receipt retention has been explicitly handled.

## Recovery

Retain deployment transaction hashes, source packages and SHA-256 commitments, policy versions, exported decision packages and indexed receipt hashes. Reconcile onchain reads after database restoration. A missing R2 object causes UNDETERMINED for a future assessment; restoring bytes with the exact digest repairs availability without changing the onchain commitment. A Studio reset requires new contract addresses and new onchain records; old finalized status cannot be carried across chains by a database migration.
