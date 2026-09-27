'use client';
import {Activity,BookOpen,FileText,Fingerprint,ShieldCheck,ArrowUpRight} from 'lucide-react';
import {sectionToPath} from '@/lib/routes';
const navigation=['Overview','Operational events','Assets','Agreements','Evidence','Determinations','Commercial effects','Organisations','Audit & verification'];
const icons=[Activity,FileText,Activity,BookOpen,FileText,Fingerprint,ArrowUpRight,ShieldCheck,ShieldCheck];
export function WorkspaceNavigation({section,onNavigate}:{section:string;onNavigate:(path:string)=>void}){return <nav className="navigation" aria-label="Main navigation">{navigation.map((name,i)=>{const Icon=icons[i];return <button key={name} className={section===name?'active':''} onClick={()=>onNavigate(sectionToPath[name])}><span className="navicon"><Icon/></span>{name}</button>})}</nav>}
