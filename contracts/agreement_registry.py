# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import json
import genlayer as gl
from genlayer import Address, u256
from genlayer.storage import TreeMap

CAUSES = ('MAINTENANCE_DEFICIENCY','OPERATOR_CAUSED','EXTERNAL_CAUSE','EQUIPMENT_DEFECT','PLANNED_MAINTENANCE','PROCESS_UPSET','INSTRUMENTATION_FAILURE','CONTROL_SYSTEM_FAILURE','POWER_UTILITY_FAILURE','FEEDSTOCK_OFFSPEC','OEM_MANUFACTURING_DEFECT','THIRD_PARTY_DAMAGE','FORCE_MAJEURE','UNDETERMINED')

class AgreementRegistry(gl.contract.Contract):
    participants: Address
    versions: TreeMap[str, str]
    current: TreeMap[str, u256]
    accepted: TreeMap[str, str]

    def __init__(self, participants: Address):
        self.participants = participants

    def _id(self, value: str):
        assert 1 <= len(value) <= 64 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in value), 'invalid identifier'

    def _policy(self, policy: str):
        assert len(policy) <= 12000
        data = json.loads(policy)
        assert data['type'] in ('MAINTENANCE_SLA','AVAILABILITY','WARRANTY','JV_ALLOCATION','REFERENCE')
        assert data['mode'] in ('OBSERVE','ENFORCE')
        window = data.get('evidenceWindowMinutes',2880)
        assert type(window) is int and 60 <= window <= 10080
        data['evidenceWindowMinutes'] = window
        lead = data.get('intervalLeadMinutes',120)
        duration = data.get('maxEventDurationMinutes',43200)
        assert type(lead) is int and 0 <= lead <= 1440
        assert type(duration) is int and 1 <= duration <= 43200
        data['intervalLeadMinutes'] = lead
        data['maxEventDurationMinutes'] = duration
        sources = data.get('externalSources',[])
        assert isinstance(sources,list) and len(sources) <= 16
        for source in sources: self._id(source)
        assert len(set(sources)) == len(sources)
        data['externalSources'] = sources
        taxonomy = data.get('causalTaxonomy', list(CAUSES))
        assert isinstance(taxonomy,list) and 1 <= len(taxonomy) <= len(CAUSES)
        assert len(set(taxonomy)) == len(taxonomy) and all(cause in CAUSES for cause in taxonomy)
        data['causalTaxonomy'] = taxonomy
        beneficiary = data.get('beneficiary','operator')
        assert beneficiary in ('operator','counterparty')
        data['beneficiary'] = beneficiary
        assets = data['assets']
        assert 1 <= len(assets) <= 32
        for asset in assets: self._id(asset)
        assert len(set(assets)) == len(assets)
        clauses = data['clauses']
        assert isinstance(clauses, list) and 1 <= len(clauses) <= 16
        seen = []
        for c in clauses:
            self._id(c['id'])
            assert c['id'] not in seen
            seen.append(c['id'])
            assert c['cause'] in taxonomy
            assert c['metric'] in ('CREDIT_PER_MINUTE','AVAILABILITY_BPS','WARRANTY_FLAG','JV_SHARE_BPS','RECORD_ONLY')
            assert type(c['threshold']) is int and 0 <= c['threshold'] <= 525600
            assert type(c['rate']) is int and 0 <= c['rate'] <= 1000000000
            assert type(c['cap']) is int and 0 <= c['cap'] <= 1000000000000
            assert isinstance(c['text'], str) and 1 <= len(c['text']) <= 1000
        exclusions = data.get('exclusions',[])
        assert isinstance(exclusions,list) and len(exclusions) <= 16
        for exclusion in exclusions:
            self._id(exclusion['id'])
            assert exclusion['id'] not in seen, 'duplicate rule identifier'
            seen.append(exclusion['id'])
            assert exclusion['cause'] in taxonomy and exclusion['cause'] != 'UNDETERMINED'
            assert 1 <= len(exclusion['text']) <= 1000
            assert isinstance(exclusion['appliesToClauses'],list) and len(exclusion['appliesToClauses']) > 0
            assert all(ref in [clause['id'] for clause in clauses] for ref in exclusion['appliesToClauses'])
        data['exclusions'] = exclusions
        age = data.get('maxEvidenceAgeMinutes',43200)
        assert type(age) is int and 60 <= age <= 525600
        data['maxEvidenceAgeMinutes'] = age
        standards = data['evidenceStandards']
        assert isinstance(standards, list) and 1 <= len(standards) <= 16 and len(standards) == len(set(standards))
        assert all(s in ('HISTORIAN','CMMS','ERP','OPC_UA','OEM','LAB','INSPECTION','MANUAL') for s in standards)
        return data

    @gl.public.write
    def propose_version(self, agreement: str, operator: str, counterparty: str, version: u256, policy: str):
        self._id(agreement); self._id(operator); self._id(counterparty)
        p = gl.contract.get_at(self.participants)
        assert p.view().authorised(operator, gl.message.sender_address), 'operator signer only'
        assert p.view().organisation(counterparty) != '' and operator != counterparty
        assert version == self.current.get(agreement, u256(0)) + u256(1), 'sequential version required'
        data = self._policy(policy)
        for source in data['externalSources']:
            assert source not in (operator,counterparty) and p.view().organisation(source) != '', 'unregistered external source'
        key = agreement + ':' + str(version)
        self.versions[key] = json.dumps({'agreement':agreement,'version':int(version),'operator':operator,'counterparty':counterparty,'policy':data}, sort_keys=True, separators=(',',':'))
        self.current[agreement] = version

    @gl.public.write
    def accept_version(self, agreement: str, version: u256):
        key = agreement + ':' + str(version)
        record = self.versions.get(key,'')
        assert record != '' and self.accepted.get(key,'') == '', 'unavailable'
        data = json.loads(record)
        assert gl.contract.get_at(self.participants).view().authorised(data['counterparty'], gl.message.sender_address), 'counterparty only'
        self.accepted[key] = 'YES'

    @gl.public.view
    def get_version(self, agreement: str, version: u256) -> str:
        key = agreement + ':' + str(version)
        record = self.versions.get(key,'')
        if record == '': return ''
        data = json.loads(record)
        data['accepted'] = self.accepted.get(key,'') == 'YES'
        return json.dumps(data, sort_keys=True, separators=(',',':'))
