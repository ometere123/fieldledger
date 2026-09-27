# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
import json
import genlayer as gl
from genlayer import Address, u256
from genlayer.storage import TreeMap

class ParticipantRegistry(gl.contract.Contract):
    owner: Address
    organisations: TreeMap[str, str]
    signers: TreeMap[str, str]
    roles: TreeMap[str, str]
    wallet_org: TreeMap[str, str]

    def __init__(self):
        self.owner = gl.message.sender_address

    @gl.public.write
    def register(self, organisation: str, name: str, signer: Address, role: str):
        assert gl.message.sender_address == self.owner, 'owner only'
        assert 1 <= len(organisation) <= 64 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-' for c in organisation)
        assert 1 <= len(name) <= 100
        assert role in ('OPERATOR','SERVICE_PROVIDER','OEM','INSPECTOR','LAB','THIRD_PARTY')
        assert self.organisations.get(organisation, '') == '', 'already registered'
        assert str(signer) != str(Address(bytes(20))) and self.wallet_org.get(str(signer),'') == '', 'signer unavailable'
        self.organisations[organisation] = name
        self.signers[organisation] = str(signer)
        self.wallet_org[str(signer)] = organisation
        self.roles[organisation] = role

    @gl.public.write
    def rotate_signer(self, organisation: str, signer: Address):
        assert str(gl.message.sender_address) == self.signers.get(organisation, ''), 'signer only'
        assert str(signer) != str(Address(bytes(20))) and self.wallet_org.get(str(signer),'') in ('',organisation), 'signer unavailable'
        self.wallet_org[str(gl.message.sender_address)] = ''
        self.signers[organisation] = str(signer)
        self.wallet_org[str(signer)] = organisation

    @gl.public.view
    def authorised(self, organisation: str, signer: Address) -> bool:
        return self.organisations.get(organisation, '') != '' and self.signers.get(organisation, '') == str(signer)

    @gl.public.view
    def organisation(self, organisation: str) -> str:
        return self.organisations.get(organisation, '')

    @gl.public.view
    def get(self, organisation: str) -> str:
        name = self.organisations.get(organisation,'')
        if name == '': return ''
        return json.dumps({'id':organisation,'name':name,'signer':self.signers[organisation],'role':self.roles[organisation]},sort_keys=True,separators=(',',':'))
