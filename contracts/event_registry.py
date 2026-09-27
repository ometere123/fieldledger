# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import json
from datetime import datetime, timedelta
import genlayer as gl
from genlayer import Address, u256
from genlayer.storage import TreeMap

EVENT_TYPES = ('UNIT_TRIP','COMPRESSOR_FAILURE','TURBINE_FAILURE','PUMP_FAILURE','PLANNED_SHUTDOWN','UNPLANNED_SHUTDOWN','UTILITY_INTERRUPTION','OTHER')

class EventRegistry(gl.contract.Contract):
    participants: Address
    agreements: Address
    authority: Address
    events: TreeMap[str, str]
    final_results: TreeMap[str, str]
    envelope_challenges: TreeMap[str, str]

    def __init__(self, participants: Address, agreements: Address):
        self.participants = participants
        self.agreements = agreements
        self.authority = gl.message.sender_address

    @gl.public.write
    def bind_consensus(self, consensus: Address):
        assert gl.message.sender_address == self.authority, 'authority only'
        self.authority = consensus

    @gl.public.write
    def open_event(self, event: str, asset: str, operator: str, event_type: str, opened_minute: u256, agreement_versions_json: str):
        assert 1 <= len(event) <= 64 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in event)
        assert 1 <= len(asset) <= 64 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in asset) and len(agreement_versions_json) <= 2000
        assert event_type in EVENT_TYPES, 'unsupported operational event type'
        assert self.events.get(event,'') == ''
        participant_view = gl.contract.get_at(self.participants).view()
        assert participant_view.organisation(operator) != '', 'operator is not registered'
        links = json.loads(agreement_versions_json)
        assert isinstance(links,list) and 1 <= len(links) <= 8
        parties = [operator]
        external_sources = []
        windows = []
        leads = []
        durations = []
        seen_links = []
        source_scopes = {}
        originator = ''
        for link in links:
            agreement = link['id']; version = u256(int(link['version']))
            link_key = agreement + ':' + str(version)
            assert link_key not in seen_links, 'duplicate agreement version'
            seen_links.append(link_key)
            assert 1 <= len(agreement) <= 64 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in agreement)
            record = gl.contract.get_at(self.agreements).view().get_version(agreement, version)
            assert record != ''
            terms = json.loads(record)
            assert terms['accepted'] and terms['operator'] == operator and asset in terms['policy']['assets'], 'agreement asset scope mismatch'
            if terms['counterparty'] not in parties: parties.append(terms['counterparty'])
            scope = agreement + ':' + str(version)
            for source in [operator, terms['counterparty']] + terms['policy'].get('externalSources',[]):
                if source not in source_scopes: source_scopes[source] = []
                if scope not in source_scopes[source]: source_scopes[source].append(scope)
            policy = terms['policy']
            windows.append(policy.get('evidenceWindowMinutes',2880))
            leads.append(policy.get('intervalLeadMinutes',120))
            durations.append(policy.get('maxEventDurationMinutes',43200))
            for source in policy.get('externalSources',[]):
                if source not in external_sources: external_sources.append(source)
        assert len(parties) >= 2
        for party in parties:
            if participant_view.authorised(party, gl.message.sender_address): originator = party
        assert originator != '', 'only an accepted agreement party may originate the event'
        party_roles = {}
        for party in parties: party_roles[party] = json.loads(participant_view.get(party))['role']
        now = datetime.fromisoformat(gl.message.datetime.replace('Z','+00:00'))
        now_minute = int(now.timestamp()//60)
        assert now_minute-10080 <= int(opened_minute) <= now_minute+5, 'reported opening outside seven-day intake window'
        close_after = (now + timedelta(minutes=max(windows))).isoformat()
        interval_start = int(opened_minute)-max(leads)
        # Physical-event bounds cover the broadest linked policy. Each agreement
        # applies its own narrower consequence window later in ObligationEngine.
        interval_end = int(opened_minute)+max(durations)
        assert interval_end > interval_start
        self.events[event] = json.dumps({'id':event,'asset':asset,'operator':operator,'eventType':event_type,'eventTypeClaims':[{'organisation':originator,'eventType':event_type,'reportedMinute':int(opened_minute)}],'originator':originator,'openedMinute':int(opened_minute),'closeAfter':close_after,'intervalStartMin':interval_start,'intervalEndMax':interval_end,'externalSources':external_sources,'sourceScopes':source_scopes,'partyRoles':party_roles,'links':links,'parties':parties}, sort_keys=True, separators=(',',':'))

    @gl.public.write
    def challenge_event_envelope(self, event: str, event_type: str, reported_minute: u256):
        assert event_type in EVENT_TYPES, 'unsupported operational event type'
        raw = self.events.get(event,'')
        assert raw != '', 'event unavailable'
        data = json.loads(raw)
        assert self.final_results.get(event,'') == '', 'event already finalized'
        now = datetime.fromisoformat(gl.message.datetime.replace('Z','+00:00'))
        assert now < datetime.fromisoformat(data['closeAfter']), 'event envelope challenge window closed'
        now_minute = int(now.timestamp()//60)
        assert now_minute-10080 <= int(reported_minute) <= now_minute+5, 'reported time outside seven-day intake window'
        assert int(reported_minute) <= int(data['openedMinute'])+10080 and int(reported_minute) >= int(data['openedMinute'])-10080, 'conflicting report too far from proposal'
        participant_view = gl.contract.get_at(self.participants).view()
        party = ''
        for org in data['parties']:
            if participant_view.authorised(org, gl.message.sender_address): party = org
        assert party != '' and party != data['originator'], 'affected counterparty signer required'
        key = event + ':' + party
        assert self.envelope_challenges.get(key,'') == '', 'one envelope challenge per counterparty'
        terms = []
        for link in data['links']:
            item = json.loads(gl.contract.get_at(self.agreements).view().get_version(link['id'],u256(int(link['version']))))
            terms.append(item['policy'])
        lead = max(int(x.get('intervalLeadMinutes',120)) for x in terms)
        duration = max(int(x.get('maxEventDurationMinutes',43200)) for x in terms)
        proposed_start = int(reported_minute)-lead
        proposed_end = int(reported_minute)+duration
        start = min(int(data['intervalStartMin']),proposed_start)
        end = max(int(data['intervalEndMax']),proposed_end)
        assert end-start <= 44640, 'combined event envelope exceeds bounded physical interval'
        data['intervalStartMin'] = start
        data['intervalEndMax'] = end
        data['eventTypeClaims'].append({'organisation':party,'eventType':event_type,'reportedMinute':int(reported_minute)})
        if event_type != data['eventType']: data['eventType'] = 'DISPUTED'
        self.envelope_challenges[key] = json.dumps({'eventType':event_type,'reportedMinute':int(reported_minute)},sort_keys=True,separators=(',',':'))
        self.events[event] = json.dumps(data,sort_keys=True,separators=(',',':'))

    @gl.public.write
    def record_finalized(self, event: str, result: str):
        assert gl.message.sender_address == self.authority, 'consensus only'
        assert self.events.get(event,'') != '' and self.final_results.get(event,'') == '', 'unavailable'
        self.final_results[event] = result

    @gl.public.view
    def authorised_org(self, organisation: str, signer: Address) -> bool:
        return gl.contract.get_at(self.participants).view().authorised(organisation,signer)

    @gl.public.view
    def get(self, event: str) -> str:
        record = self.events.get(event,'')
        if record == '': return ''
        data = json.loads(record)
        data['finalResult'] = self.final_results.get(event,'')
        return json.dumps(data, sort_keys=True, separators=(',',':'))
