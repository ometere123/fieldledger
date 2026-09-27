# Threat model and failure analysis

| Attack or failure | Enforcement boundary | Remaining live verification |
| --- | --- | --- |
| Operator closes early or fills every slot | Accepted policy window with the longest linked deadline, permissionless closure after deadline, reserved per-party capacity and six external slots | Verify network time and multi-party submissions in a live flow. |
| Losing counterparty refuses time attestation | Neutral time interval comes from the evidence-dependent validator determination | Independently validate interval against historian timestamps and staleness. |
| Cross-party evidence edit, duplicate or post-freeze mutation | No onchain update/delete, unique evidence ID, digest URL, deadline and frozen manifest | Check live revert codes and R2 retention. |
| Wrong package ID/event/org/type/time/target | Each identifying field matched against onchain record before semantic assessment | Run live validators against malicious fixtures. |
| Fabricated evidence or clause, unsupported leader | Validator independently assesses cause, party, interval, cited evidence and versioned rules; allowlists enforced | Shared-model bias and validator collusion require live challenge tests. |
| Signer impersonation or double role | Registry signer uniqueness and source signer check; app Auth is independent | Real corporate identity onboarding remains external. |
| Malicious source report prompt injection | Evidence is JSON facts in an untrusted section; independent validators compare conclusions | Live adversarial model behaviour may differ from Direct Mode mocks. |
| Source unavailable or hash mismatch | Invalid package is discarded; fewer than two distinct usable organisations yields UNDETERMINED; no automatic effect | Public package availability and gateway disaster recovery. |
| Forged Supabase FINALIZED row | Contract effect reads final result onchain; indexer checks decoded receipt and contract postcondition | Reconcile against live 61997 RPC and independent explorer. |
| Child message underfunded or fails | Pending stage, discovered child receipt, `redeliver` emits a new finalized child; duplicate final result rejected | Prove actual fee allocation, failure and retry on Studio Dev. |
| Appeal after ACCEPTED | No commercial effect until finalized child result | Live appeal round and final receipt. |
| Wrong wallet/network | SDK wallet chain guard, contract signer authority and independent application membership | Browser wallet on 61997. |
| Backend/R2 breach | SHA-256 onchain commitments reject substitute bytes; source availability remains a dependency | R2 bucket access, audit logging and object retention. |
| Economic or model collusion | Multiple sources, independent validator assessment and appeal; no administrator override | Organisational identity governance and validator diversity. |

The accepted window and slot allocation are operational defaults; on a real asset, configure evidence retention and escalation procedures with parties before entering an agreement. This release has no private adjudication and no settlement payment rail.
