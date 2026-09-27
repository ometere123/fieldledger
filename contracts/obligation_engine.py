# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import json
import genlayer as gl
from genlayer import Address, u256
from genlayer.storage import TreeMap

class ObligationEngine(gl.contract.Contract):
    events: Address
    agreements: Address
    effects: TreeMap[str,str]
    claims: TreeMap[str,str]

    def __init__(self,events:Address,agreements:Address):
        self.events = events
        self.agreements = agreements

    @gl.public.write
    def apply(self,event:str,agreement:str,version:u256):
        key = event + ':' + agreement + ':' + str(version)
        assert self.effects.get(key,'') == '', 'already applied'
        ev_raw = gl.contract.get_at(self.events).view().get(event)
        assert ev_raw != ''
        ev = json.loads(ev_raw)
        assert ev['finalResult'] != '', 'finalized child delivery missing'
        assert any(x['id'] == agreement and int(x['version']) == int(version) for x in ev['links'])
        term_raw = gl.contract.get_at(self.agreements).view().get_version(agreement,version)
        assert term_raw != ''
        terms = json.loads(term_raw)
        assert terms['accepted']
        result = json.loads(ev['finalResult'])
        assert result['cause'] != 'UNDETERMINED', 'insufficient evidence blocks consequences'
        assert result['responsible_domain'] in ('OPERATOR','MAINTENANCE','OEM','EXTERNAL','NONE')
        assert int(ev['intervalStartMin']) <= int(result['start_minute']) < int(result['end_minute']) <= int(ev['intervalEndMax']), 'interval outside event bounds'
        # The event interval is canonical physical truth. Each commercial
        # policy applies only its own agreed scope and never truncates that
        # shared event for another linked agreement.
        policy = terms['policy']
        consequence_start = max(int(result['start_minute']),int(ev['openedMinute'])-int(policy.get('intervalLeadMinutes',120)))
        consequence_end = min(int(result['end_minute']),int(ev['openedMinute'])+int(policy.get('maxEventDurationMinutes',43200)))
        minutes = u256(max(0,consequence_end-consequence_start))
        assert minutes <= u256(43200)
        outcomes = []
        for clause in terms['policy']['clauses']:
            if result['cause'] not in terms['policy'].get('causalTaxonomy',[result['cause']]): break
            clause_ref = agreement+':'+str(version)+':'+clause['id']
            if clause['cause'] != result['cause'] or clause_ref not in result['clause_ids']: continue
            if any(exc['cause'] == result['cause'] and clause['id'] in exc['appliesToClauses'] and agreement+':'+str(version)+':'+exc['id'] in result['excluded_clause_ids'] for exc in terms['policy'].get('exclusions',[])): continue
            threshold = u256(int(clause['threshold'])); rate = u256(int(clause['rate'])); cap = u256(int(clause['cap']))
            excess = minutes-threshold if minutes > threshold else u256(0)
            metric = clause['metric']
            value = u256(0)
            if metric == 'CREDIT_PER_MINUTE': value = min(excess*rate,cap)
            elif metric == 'AVAILABILITY_BPS': value = u256(10000)-min(excess*rate,u256(10000))
            elif metric == 'WARRANTY_FLAG': value = u256(1) if excess > u256(0) else u256(0)
            elif metric == 'JV_SHARE_BPS': value = min(rate,u256(10000)) if excess > u256(0) else u256(0)
            outcomes.append({'clause':agreement+':'+str(version)+':'+clause['id'],'metric':metric,'value':int(value)})
        mode = terms['policy']['mode']
        beneficiary = terms['operator'] if terms['policy'].get('beneficiary','operator') == 'operator' else terms['counterparty']
        obligor = terms['counterparty'] if beneficiary == terms['operator'] else terms['operator']
        credit = sum(x['value'] for x in outcomes if x['metric'] == 'CREDIT_PER_MINUTE')
        self.effects[key] = json.dumps({'event':event,'agreement':agreement,'version':int(version),'mode':mode,'cause':result['cause'],'durationMinutes':int(minutes),'outcomes':outcomes,'enforcementStatus':'DUE' if mode == 'ENFORCE' and any(x['value'] > 0 for x in outcomes) else 'NONE','claimableCredit':credit if mode == 'ENFORCE' else 0,'beneficiary':beneficiary if mode == 'ENFORCE' else '','obligor':obligor if mode == 'ENFORCE' else '','paid':False},sort_keys=True,separators=(',',':'))

    @gl.public.write
    def claim(self,event:str,agreement:str,version:u256):
        key = event + ':' + agreement + ':' + str(version)
        record = self.effects.get(key,'')
        assert record != '' and self.claims.get(key,'') == '', 'claim unavailable'
        effect = json.loads(record)
        assert effect['mode'] == 'ENFORCE' and effect['claimableCredit'] > 0 and effect['enforcementStatus'] == 'DUE', 'not a claimable credit'
        assert gl.contract.get_at(self.events).view().authorised_org(effect['beneficiary'],gl.message.sender_address), 'beneficiary signer only'
        self.claims[key] = json.dumps({'event':event,'agreement':agreement,'version':int(version),'beneficiary':effect['beneficiary'],'obligor':effect['obligor'],'credit':effect['claimableCredit'],'status':'CLAIMED'},sort_keys=True,separators=(',',':'))

    @gl.public.view
    def get_claim(self,event:str,agreement:str,version:u256)->str:
        return self.claims.get(event+':'+agreement+':'+str(version),'')

    @gl.public.view
    def get(self,event:str,agreement:str,version:u256)->str:
        return self.effects.get(event+':'+agreement+':'+str(version),'')
