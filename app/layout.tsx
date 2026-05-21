import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Polymarket Screen',
  description: 'Render Polymarket market graphics as videos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
