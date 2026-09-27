import { createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cliArgs = process.argv.slice(2);
const checkOnly = cliArgs.includes('--check');
const packagePath = cliArgs.find((arg) => arg !== '--check');
if (!packagePath) throw Error('Usage: node scripts/package-evidence.mjs [--check] fixtures/example-package.json');

const input = readFileSync(packagePath);
const data = JSON.parse(input.toString('utf8'));
if (!Array.isArray(data.facts) || data.facts.length < 1 || data.facts.length > 10) {
  throw Error('Evidence must contain 1-10 facts');
}
for (const field of ['evidenceId', 'eventId', 'organisation', 'type', 'observedAt']) {
  if (typeof data[field] !== 'string' || !data[field]) throw Error(`Evidence field ${field} is required`);
}

// Match the Worker canonical JSON encoding used for its SHA-256 digest and R2 object.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const canonicalBytes = Buffer.from(canonical(data), 'utf8');
const digest = createHash('sha256').update(canonicalBytes).digest('hex');
const packageBytes = canonicalBytes.length;
const factCount = data.facts.length;

const manifestPath = resolve('deployment.studio-dev.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.chainId !== 61997 || manifest.network !== 'studio-dev') throw Error('Manifest is not Studio Dev chain 61997');
const liveCase = manifest.liveCases?.find((item) => item.id === data.eventId);
if (!liveCase) throw Error(`Event ${data.eventId} is not in the live deployment manifest`);
const packageRecord = liveCase.evidence?.find((item) => item.id === data.evidenceId);
if (!packageRecord) throw Error(`Evidence ${data.evidenceId} is not in the live event manifest`);
if (packageRecord.organisation !== data.organisation || packageRecord.digest !== digest) {
  throw Error('Fixture organisation or canonical digest differs from the existing on-chain commitment');
}

const transaction = manifest.liveTransactions?.find((item) => item.hash === packageRecord.transaction);
const committed = transaction?.evidencePackage;
const transactionArgs = transaction?.args;
if (!committed || !Array.isArray(transactionArgs) || transactionArgs[0] !== data.evidenceId || transactionArgs[1] !== data.eventId ||
    transactionArgs[2] !== data.organisation || transactionArgs[3] !== data.type || transactionArgs[4] !== digest ||
    transactionArgs[5] !== data.observedAt || transactionArgs[6] !== (data.targetEvidenceId ?? '') ||
    String(transactionArgs[7]) !== String(packageBytes) || String(transactionArgs[8]) !== String(factCount) ||
    committed.evidenceId !== data.evidenceId || committed.organisation !== data.organisation ||
    committed.type !== data.type || committed.digest !== digest || committed.packageBytes !== packageBytes ||
    committed.factCount !== factCount ||
    JSON.stringify(committed.admissibleFor) !== JSON.stringify(packageRecord.admissibleFor)) {
  throw Error('Fixture fields differ from the existing on-chain commitment; refusing upload');
}
if (checkOnly) {
  console.log(`On-chain commitment matches ${data.evidenceId}: ${digest} (${packageBytes} canonical bytes)`);
  process.exit(0);
}

const gateway = process.env.GATEWAY_URL;
if (!gateway) throw Error('GATEWAY_URL missing');
const secret = JSON.parse(process.env.ORGANISATION_HMAC_KEYS ?? '{}')[data.organisation];
if (!secret) throw Error('Organisation HMAC secret missing');
const timestamp = Date.now();
const signature = createHmac('sha256', secret)
  .update(`${timestamp}.${createHash('sha256').update(input).digest('hex')}`).digest('hex');

const response = await fetch(`${gateway.replace(/\/$/, '')}/v1/evidence/source`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-fieldledger-timestamp': String(timestamp),
    'x-fieldledger-signature': signature,
  },
  body: input,
});
const result = await response.json();
if (!response.ok) throw Error(`Evidence upload failed (${response.status}): ${JSON.stringify(result)}`);
if (result.digest !== digest || result.packageBytes !== packageBytes || result.factCount !== factCount ||
    result.evidenceId !== data.evidenceId || result.eventId !== data.eventId ||
    result.organisation !== data.organisation || result.type !== data.type || result.observedAt !== data.observedAt ||
    result.targetEvidenceId !== (data.targetEvidenceId ?? '') ||
    result.url !== committed.sourceUrl) {
  throw Error('Gateway receipt does not match the existing on-chain commitment');
}

const objectResponse = await fetch(result.url);
if (!objectResponse.ok) throw Error(`Public evidence fetch failed (${objectResponse.status})`);
const storedBytes = Buffer.from(await objectResponse.arrayBuffer());
const storedDigest = createHash('sha256').update(storedBytes).digest('hex');
if (storedDigest !== digest || storedBytes.length !== packageBytes ||
    objectResponse.headers.get('x-evidence-sha256') !== digest) {
  throw Error('Stored evidence object failed digest or size verification');
}

const receipt = {
  ...result,
  id: data.evidenceId,
  event: data.eventId,
  organisation: data.organisation,
  type: data.type,
  observedAt: data.observedAt,
  verified: true,
  onchainTransaction: packageRecord.transaction,
};
writeFileSync('evidence-receipt.json', `${JSON.stringify(receipt, null, 2)}\n`);
committed.uploaded = true;
committed.uploadedAt = new Date().toISOString();
committed.sourceUrl = result.url;
committed.verifiedDigest = storedDigest;
packageRecord.uploaded = true;
packageRecord.sourceUrl = result.url;
const liveTransaction = manifest.liveTransactions.find((item) => item.hash === packageRecord.transaction);
liveTransaction.evidencePackage = committed;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Uploaded and verified ${data.evidenceId}: ${digest} (${packageBytes} canonical bytes)`);
