import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MediScribe Live: Autonomous Bedside Clinical Assistant & Triage Copilot',
  description: 'AI Voice Agent and Ambient Clinical Scribe powered by AssemblyAI Voice Agent API and Realtime STT with medical-v1 domain.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-teal-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
