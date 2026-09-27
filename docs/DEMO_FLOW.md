# Synthetic industrial scenarios

All names, equipment and readings are synthetic. `fixtures/scenarios.json` covers a compressor service deficiency across maintenance, availability and OEM versions; an operator isolation exclusion; a generator with inconsistent fuel evidence producing UNDETERMINED; an external utility claim contradicted by feeder metering; and a single event mapped to several deterministic obligations. `fixtures/source-examples.json` provides typed adapter input. `fixtures/example-package.json` is a minimal public adjudication package; it does not alone establish a cause.

1. Register operator, service provider, OEM, JV partner and independent inspector with separate wallets using `node scripts/protocol.mjs seed`.
2. Run `node scripts/demo-run.mjs agreements` to propose and accept the five synthetic policy versions. Capture clause IDs and explicit exclusions.
3. Run `node scripts/demo-run.mjs event` to open one event with all five links, asset tag and a reported time marker.
4. Let each party submit its own digest-bound packages. Include a signed challenge package targeting the contested record. Confirm wrong-party submissions and tampering fail.
5. After the accepted multi-party evidence window, close and freeze. Confirm later mutation fails.
6. Determine once. Inspect validator rounds and challenge the protocol decision through `getAppealCharge` and `appealTransaction` while ACCEPTED.
7. Wait for FINALIZED **and** `FINISHED_WITH_RETURN`, then verify the finalized child. If it failed, inspect funding and call `redeliver` with a new fee quote.
8. Run `node scripts/demo-run.mjs effects` to apply each linked agreement separately. Compare credit units, availability basis points, warranty flag, JV share and reference record. Verify OBSERVE versus ENFORCE and duplicate rejection.
9. Repeat with contradictory records. UNDETERMINED must prevent automatic effect creation.
10. Export the decision package and independently read manifest, evidence records, result and effects from GenLayer.
