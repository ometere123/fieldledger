import {notFound} from 'next/navigation';
import {slugToSection} from '@/lib/routes';
import Workspace from '@/components/workspace';
export default async function SectionRoute({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!slugToSection[section])notFound();return <Workspace/>}
