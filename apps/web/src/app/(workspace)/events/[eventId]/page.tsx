import {notFound} from 'next/navigation';
import Workspace from '@/components/workspace';
export default async function EventRoute({params}:{params:Promise<{eventId:string}>}){const {eventId}=await params;if(!/^[A-Za-z0-9_-]{1,64}$/.test(eventId))notFound();return <Workspace/>}
