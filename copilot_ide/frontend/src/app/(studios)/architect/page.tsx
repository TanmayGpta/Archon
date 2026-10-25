import type { Metadata } from 'next';
import { ArchitectStudio } from './ArchitectStudio';

export const metadata: Metadata = { title: 'Architect' };

export default function ArchitectPage() {
  return (
    <main className="w-full min-h-[calc(100vh-56px)] bg-[#090b0e]">
      <ArchitectStudio />
    </main>
  );
}
