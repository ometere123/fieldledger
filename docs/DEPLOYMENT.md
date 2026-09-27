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

The R2 bucket and Worker are deployed for Studio Dev. `ORGANISATION_HMAC_KEYS` and `INTERNAL_CRON_TOKEN` are Worker secrets. Keep `SUPABASE_URL` and `SUPABASE_ANON_KEY` as dashboard variables (project URL and `sb_publishable_...` key), and `SUPABASE_SERVICE_ROLE_KEY` as the `sb_secret_...` Worker secret. Deploy with `npm run worker:deploy`; its `--keep-vars` flag preserves dashboard-managed variables. The Worker sends modern secret keys only in `apikey`; it also accepts a legacy JWT `service_role` key. Never paste service keys into chat or commit them. The production `ALLOWED_ORIGIN` is `https://fieldledger-sage.vercel.app`; a live preflight confirmed the matching CORS response. The 15-minute Cron Trigger reconciles finalized receipts and child messages. `POST /internal/reconcile` requires `INTERNAL_CRON_TOKEN`; it is a retry endpoint, never a verdict setter. Restrict source system adapters to minimal facts; the returned digest URL must be publicly retrievable by validators.

## 4. Fee bootstrap and six-contract deployment

Use Studio Dev only: chain **61997**, RPC `https://studio-dev.genlayer.com/api`, explorer `https://explorer-studio-dev.genlayer.com/`. Keep private keys local. `scripts/profile-fees.mjs bootstrap` asks the network for policy and a quote, but its allocations remain **unmeasured**. Do not enable browser writes until representative fee measurements and successful live transaction flows have been recorded.

```bash
node scripts/profile-fees.mjs bootstrap
node scripts/protocol.mjs deploy
node scripts/protocol.mjs verify
```

Deployment order: ParticipantRegistry → AgreementRegistry → EventRegistry → EvidenceRegistry → EventConsensus → ObligationEngine → `EventRegistry.bind_consensus`. Set `GATEWAY_BASE_URL` before EvidenceRegistry deployment, ending in `/v1/evidence/`. Store `deployment.studio-dev.json` securely; it maps all six addresses. Studio reset: regenerate quote, redeploy in order, reseed, update Worker/Vercel address maps and reindex finalized receipts. Never transplant a previous chain's indexed FINALIZED rows as truth.

### Current Studio Dev state

The latest six deployments are recorded in the ignored local `deployment.studio-dev.json`; every deployment transaction was verified as `FINALIZED` with `FINISHED_WITH_RETURN` through Studio Dev RPC and [Explorer Studio Dev](https://explorer-studio-dev.genlayer.com/). EvidenceRegistry and EventConsensus were redeployed after the final Direct Mode fixes. The gateway Worker and R2 bucket are deployed, the current checksummed contract map is in Worker vars, and `/health` reports chain 61997.

Four earlier `EventRegistry.bind_consensus` calls and two earlier `ParticipantRegistry.register` calls failed with `malformed_entry`. The Studio Dev Explorer exposes the failed entry bytes; they use a literal `method` map key, which matches the legacy encoder bundled in GenLayer CLI 0.40.0-rc2. GenVM v0.6 requires the method name under the empty key `""`. After upgrading to CLI 0.40.0-rc.3, selecting its built-in Studio Dev profile, and using its corrected encoder, `EventRegistry.bind_consensus` finalized with `FINISHED_WITH_RETURN` and 5/5 validator votes revealed. Explorer execution details show `SUCCESS` and a 250,000,000 wei storage charge; the settled receipt reports 78,628,250,000,823 wei spent from the 0.175 GEN deposit and a 174,921,371,750,111,971 wei refund. The successful call resolves the earlier encoding failure and binds the EventRegistry to EventConsensus. Corrected `ParticipantRegistry.register` calls for five organisations have finalized, and explorer search recovered all five hashes; the registry reads confirm distinct signers. The deployer transferred 0.25 GEN each to four counterparty wallets. Five synthetic agreement versions were proposed by the operator and independently accepted by their counterparties. Event `FL-2026-184` was opened by `OP-WR`, links all five agreements, and has a finalized `MNT-SP` envelope challenge that changed its type to `DISPUTED` while retaining bounded physical-event limits. Direct Mode tests, including the one-time binding test, pass. Studio Dev's `sim_call` rejects write simulations; official GenLayer docs describe that simulation API as localnet-only. The separate `gen_dbg_traceTransaction` method is unavailable, but Explorer's full consensus record provided the raw bytes needed for this diagnosis. Keep the browser fee profile unmeasured until representative successful methods and child/appeal fees are profiled.

## 5. Live fee and multi-party verification

The ignored local manifest contains five distinct synthetic organisations, five accepted agreement versions, disputed event `FL-2026-184`, and four finalized EvidenceRegistry commitments. `fixtures/live/` contains the corresponding package bytes. The four existing packages are uploaded and verified through the deployed Worker; the uploader checked each committed transaction, receipt, public object digest and byte size, then marked the local manifest. Do not submit replacement commitments. If restoring the environment, first run `node --env-file=.env.local scripts/package-evidence.mjs --check fixtures/live/<package>.json` for each package; upload only packages whose `uploaded` flag is false using `node --env-file=.env.local scripts/package-evidence.mjs fixtures/live/<package>.json`. The OEM record is admissible for `OEM-2025-11:1` only; the contractor record is admissible for `MNT-2026-04:1` and `AVL-2026-02:1`. The current fee profile remains unmeasured. `node scripts/profile-fees.mjs quote-child` obtains current-price child-message budgets for `determine` and `redeliver` without enabling browser writes; repeat it near the live transaction because network prices may change. The existing local GenLayer CLI keystore contains unlocked operator and counterparty accounts, so no private key export is needed. Close the event only after `2026-09-29T23:38:52.849266Z`, determine, verify finality and child delivery, and apply each accepted policy separately. `scripts/seed-flow.mjs` journals hashes before waiting and resumes a prior submission; do not submit a second transaction after a timeout. Use new IDs for additional scenarios. Hosted Studio Dev does not expose local simulator time controls: the documented `sim_increase_time` / `sim_set_time` methods belong to local `glsim` ([GenLayer test simulator RPC](https://docs.genlayer.com/api-references/genlayer-test/glsim)), so allow the real onchain evidence window to elapse.

`node scripts/profile-fees.mjs init-ledger` creates the ignored `fee-measurements.json` from the 28 distinct finalized deployment, binding and live-method hashes already recorded in the manifest; it refuses to overwrite a ledger. Add each future finalized receipt with its distinct scenario name. `node scripts/profile-fees.mjs account <hash>` is a read-only public RPC inspection and does not need a signer key. Six deployments, the successful `bind_consensus` call and 21 successful live app-method receipts are now present in the ledger; prior failed legacy-encoding writes are excluded. The bind consumed 78,628,250,000,000 execution units including 250,000,000 storage fee units; 78,628,250,000,823 wei was charged from a 0.175000000000112794 GEN deposit, and the remainder was refunded. `bootstrap` reproduces the 0.175000000000112794 GEN deposit quote using the observed allocations. These settled method samples establish a baseline for six method families only; they do not profile all app paths or child fees and must not enable browser writes. Complete the ledger with `claim`, `redeliver` and at least two distinct named scenarios each for `open_event`, `submit`, `determine` and `apply`. `node scripts/profile-fees.mjs measure fee-measurements.json` requires successful child delivery, an appealed determination, and fee-bearing finalized receipts. Independently confirm the appeal in the explorer; a round count alone is not cryptographic proof of appeal. Review measured consumption and refunds before enabling browser writes. Test an intentionally underfunded child, successful `redeliver`, duplicate apply, UNDETERMINED and the policy metrics with distinct wallets.

## 6. Vercel

The production Vercel project is `fieldledger`, deployed at [https://fieldledger-sage.vercel.app](https://fieldledger-sage.vercel.app). Its Root Directory is `apps/web`; because the lockfile and package manifest live at the repository root, its install command is `cd ../.. && npm ci` and its build command is `cd ../.. && npm run build`. The framework is Next.js with standalone output. Production has only the four public frontend variables: `NEXT_PUBLIC_CONTRACTS_JSON`, `NEXT_PUBLIC_GATEWAY_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the Supabase publishable key is browser-safe. The Supabase service-role key and signer keys must never be set in Vercel. The Cloudflare Worker `ALLOWED_ORIGIN` is set to the production origin. The site and API preflight returned HTTP 200. Still verify sign-in, organisation membership, wallet 61997 guard, live fee quote, ACCEPTED, appeal, FINALIZED with successful execution, child delivery, multiple effects and audit export in the deployed browser.

## Recovery

Retain deployment transaction hashes, source packages and SHA-256 commitments, policy versions, exported decision packages and indexed receipt hashes. Reconcile onchain reads after database restoration. A missing R2 object causes UNDETERMINED for a future assessment; restoring bytes with the exact digest repairs availability without changing the onchain commitment. A Studio reset requires new contract addresses and new onchain records; old finalized status cannot be carried across chains by a database migration.
