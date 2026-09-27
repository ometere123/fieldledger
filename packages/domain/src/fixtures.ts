export type EventRow = { id:string; asset:string; site:string; title:string; opened:string; stage:string; priority:string; evidence:string; exposure:string; cause?:string; agreements:string[]; mode:'OBSERVE'|'ENFORCE'; tx?:string };
export const events: EventRow[] = [
  {id:'FL-2026-184',asset:'K-401B',site:'Warri River / compression',title:'Compressor trip following lube oil pressure decay',opened:'24 Sep 2026 · 07:42 WAT',stage:'Evidence challenged',priority:'High',evidence:'5 / 6 received',exposure:'₦18.4m indicative',agreements:['MNT-2026-04','AVL-2026-02','OEM-2025-11'],mode:'ENFORCE'},
  {id:'FL-2026-179',asset:'P-204A',site:'Warri River / water injection',title:'Injection pump shutdown after operator isolation',opened:'21 Sep 2026 · 14:18 WAT',stage:'Finalized',priority:'Routine',evidence:'4 / 4 verified',exposure:'Exclusion applies',cause:'OPERATOR_CAUSED',agreements:['MNT-2026-04'],mode:'OBSERVE'},
  {id:'FL-2026-176',asset:'G-08',site:'East flowstation / power',title:'Generator outage with conflicting fuel records',opened:'19 Sep 2026 · 03:11 WAT',stage:'Undetermined',priority:'Review',evidence:'3 / 5 received',exposure:'Held pending evidence',cause:'UNDETERMINED',agreements:['PWR-2026-01'],mode:'ENFORCE'},
  {id:'FL-2026-171',asset:'K-401A',site:'Warri River / compression',title:'Compressor outage attributed to grid event',opened:'16 Sep 2026 · 18:36 WAT',stage:'Under consensus',priority:'Review',evidence:'6 / 6 verified',exposure:'₦6.2m indicative',agreements:['MNT-2026-04','AVL-2026-02'],mode:'ENFORCE'},
  {id:'FL-2026-165',asset:'V-112',site:'Warri River / process',title:'Separator pressure excursion and instrument drift',opened:'12 Sep 2026 · 09:04 WAT',stage:'Open',priority:'Routine',evidence:'2 / 4 received',exposure:'Assessment pending',agreements:['INS-2026-07'],mode:'OBSERVE'}
];
export const agreements = [
  {id:'MNT-2026-04',name:'Rotating equipment maintenance SLA',parties:'Operator · Service provider',mode:'ENFORCE',scope:'K-401A/B, P-204A',rule:'Credit after 120 min qualifying downtime'},
  {id:'AVL-2026-02',name:'Compression availability covenant',parties:'Operator · JV partners',mode:'OBSERVE',scope:'Compression trains',rule:'Monthly availability threshold 98.5%'},
  {id:'OEM-2025-11',name:'Compressor warranty support',parties:'Operator · OEM',mode:'OBSERVE',scope:'K-401B',rule:'Cause dependent warranty allocation'},
  {id:'PWR-2026-01',name:'Power island response',parties:'Operator · Contractor',mode:'ENFORCE',scope:'G-08',rule:'Credit after 60 min qualifying outage'}
];
