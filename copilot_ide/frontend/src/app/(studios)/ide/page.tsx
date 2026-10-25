import type { Metadata } from 'next';
import { IdeStudio } from '../../components/AskAndIdeStudios';

export const metadata: Metadata = { title: 'IDE' };

export default function IdePage() {
  return (
    <main className="w-full h-[calc(100vh-56px)] overflow-hidden">
      <IdeStudio />
    </main>
  );
}
