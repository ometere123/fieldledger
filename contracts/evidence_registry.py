# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import json
import hashlib
from datetime import datetime
import genlayer as gl
from genlayer import Address, u256
from genlayer.storage import TreeMap

MAX_EVIDENCE_ITEMS = 24
MAX_PACKAGE_BYTES = 4096
MAX_PACKAGE_FACTS = 10
MAX_EVENT_BYTES = 131072
MAX_EVENT_FACTS = 240

class EvidenceRegistry(gl.contract.Contract):
    participants: Address
    events: Address
    gateway_base: str
    records: TreeMap[str, str]
    event_ids: TreeMap[str, str]
    frozen: TreeMap[str, str]
    event_bytes: TreeMap[str, u256]
    event_facts: TreeMap[str, u256]

    def __init__(self, participants: Address, events: Address, gateway_base: str):
        assert gateway_base.startswith('https://') and gateway_base.endswith('/v1/evidence/') and len(gateway_base) <= 250
        self.participants = participants
        self.events = events
        self.gateway_base = gateway_base

    def _id(self, value: str):
        assert 1 <= len(value) <= 64 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in value), 'invalid identifier'

    @gl.public.write
    def submit(self, evidence: str, event: str, organisation: str, kind: str, digest: str, observed_at: str, target: str, package_bytes: u256, fact_count: u256):
        self._id(evidence); self._id(event); self._id(organisation)
        assert self.records.get(evidence,'') == '' and self.frozen.get(event,'') == ''
        ev_raw = gl.contract.get_at(self.events).view().get(event)
        assert ev_raw != ''
        ev = json.loads(ev_raw)
        scopes = ev.get('sourceScopes',{}).get(organisation,[])
        assert scopes and (organisation in ev['parties'] or organisation in ev['externalSources']), 'source not accepted by agreement'
        assert gl.contract.get_at(self.participants).view().authorised(organisation, gl.message.sender_address), 'source signer only'
        assert datetime.fromisoformat(gl.message.datetime.replace('Z','+00:00')) < datetime.fromisoformat(ev['closeAfter']), 'evidence window closed'
        assert kind in ('HISTORIAN','CMMS','ERP','OPC_UA','OEM','LAB','INSPECTION','MANUAL','CHALLENGE')
        assert len(digest) == 64 and all(c in '0123456789abcdef' for c in digest)
        assert len(observed_at) <= 40 and '|' not in observed_at
        assert 1 <= int(package_bytes) <= MAX_PACKAGE_BYTES, 'package byte allocation exceeded'
        assert 1 <= int(fact_count) <= MAX_PACKAGE_FACTS, 'package fact allocation exceeded'
        assert target == '' or self.records.get(target,'') != '', 'challenge target missing'
        assert (kind == 'CHALLENGE') == (target != ''), 'challenge package required'
        if target != '':
            self._id(target)
            assert json.loads(self.records[target])['event'] == event
        ids = json.loads(self.event_ids.get(event,'[]'))
        assert len(ids) < MAX_EVIDENCE_ITEMS, 'event evidence limit'
        party_count = 0
        external_count = 0
        for existing in ids:
            org = json.loads(self.records[existing])['organisation']
            if org == organisation: party_count += 1
            if org not in ev['parties']: external_count += 1
        party_limit = max(2,(MAX_EVIDENCE_ITEMS-6)//len(ev['parties'])) if organisation in ev['parties'] else max(1,6//max(1,len(ev['externalSources'])))
        assert party_count < party_limit, 'source allocation exhausted'
        if organisation not in ev['parties']: assert external_count < 6, 'third-party allocation exhausted'
        next_bytes = int(self.event_bytes.get(event,u256(0))) + int(package_bytes)
        next_facts = int(self.event_facts.get(event,u256(0))) + int(fact_count)
        assert next_bytes <= MAX_EVENT_BYTES and next_facts <= MAX_EVENT_FACTS, 'whole-event evidence allocation exhausted'
        # A fixed 4 KiB / 10-fact item cap means even all 24 allowed slots
        # fit within 96 KiB and 240 facts. Capacity is therefore reserved at
        # admission; a submitter cannot make close_window freeze an over-budget
        # manifest by choosing a later, individually valid package.
        assert next_bytes <= MAX_EVIDENCE_ITEMS * MAX_PACKAGE_BYTES
        assert next_facts <= MAX_EVIDENCE_ITEMS * MAX_PACKAGE_FACTS
        record = {'id':evidence,'event':event,'organisation':organisation,'kind':kind,'digest':digest,'url':self.gateway_base+digest,'observedAt':observed_at,'target':target,'packageBytes':int(package_bytes),'factCount':int(fact_count),'admissibleFor':scopes}
        self.records[evidence] = json.dumps(record, sort_keys=True, separators=(',',':'))
        ids.append(evidence)
        self.event_ids[event] = json.dumps(ids,separators=(',',':'))
        self.event_bytes[event] = u256(next_bytes)
        self.event_facts[event] = u256(next_facts)

    @gl.public.write
    def close_window(self, event: str):
        ev_raw = gl.contract.get_at(self.events).view().get(event)
        assert ev_raw != '' and self.frozen.get(event,'') == ''
        ev = json.loads(ev_raw)
        now = datetime.fromisoformat(gl.message.datetime.replace('Z','+00:00'))
        assert now >= datetime.fromisoformat(ev['closeAfter']), 'multi-party evidence window still open'
        ids = json.loads(self.event_ids.get(event,'[]'))
        assert len(ids) >= 2 and len(set(ids)) == len(ids), 'insufficient manifest'
        records = [self.records[eid] for eid in ids]
        total_bytes = sum(int(json.loads(record)['packageBytes']) for record in records)
        total_facts = sum(int(json.loads(record)['factCount']) for record in records)
        assert total_bytes == int(self.event_bytes.get(event,u256(0))) and total_facts == int(self.event_facts.get(event,u256(0)))
        assert total_bytes <= MAX_EVENT_BYTES and total_facts <= MAX_EVENT_FACTS, 'manifest exceeds adjudication budget'
        payload = json.dumps(records, separators=(',',':'))
        self.frozen[event] = hashlib.sha256(payload.encode('utf-8')).hexdigest()

    @gl.public.view
    def get(self, evidence: str) -> str:
        return self.records.get(evidence,'')

    @gl.public.view
    def manifest(self, event: str) -> str:
        return json.dumps({'digest':self.frozen.get(event,''),'ids':json.loads(self.event_ids.get(event,'[]'))},sort_keys=True,separators=(',',':'))
