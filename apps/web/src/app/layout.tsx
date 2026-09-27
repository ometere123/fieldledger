import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'FIELDLEDGER | Operational assurance', description: 'Canonical operational event determinations for industrial agreements' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
