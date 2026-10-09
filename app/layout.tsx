import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Canvas GTM · De la evidencia a la oportunidad', description: 'Un espacio local de investigación de mercado con decisiones humanas.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
