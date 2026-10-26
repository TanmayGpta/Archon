import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { IdeStudio } from './IDE';

export const metadata: Metadata = { title: 'IDE' };

export default function IdePage() {
  return (
    <main className="w-full h-[calc(100vh-56px)] overflow-hidden">
      {/* The IDE's three panes need room; narrower windows get a pointer to the other studios */}
      <div className="lg:hidden h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold text-fg-strong">The IDE needs a wider window</p>
        <p className="text-sm text-fg-muted max-w-sm">
          Make the window at least 1024px wide to use the editor, file tree and agent chat side by side. The other
          studios work at any width.
        </p>
        <nav aria-label="Other studios" className="flex flex-wrap justify-center gap-2 text-sm">
          {[['/ask', 'Ask'], ['/evaluation', 'Evaluation'], ['/architect', 'Architect'], ['/conformance', 'Conformance']].map(([href, label]) => (
            <Link key={href} href={href} className="px-3 py-1.5 rounded-control border border-line text-fg-soft hover:bg-raised">
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="hidden lg:block h-full">
        <Suspense>
          <IdeStudio />
        </Suspense>
      </div>
    </main>
  );
}
