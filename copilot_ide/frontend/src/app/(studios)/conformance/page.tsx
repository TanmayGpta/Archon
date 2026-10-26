import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConformanceRoute } from './ConformanceRoute';

export const metadata: Metadata = { title: 'Conformance' };

export default function ConformancePage() {
  return (
    <main className="w-full min-h-[calc(100vh-56px)] bg-[#080808]">
      <Suspense>
        <ConformanceRoute />
      </Suspense>
    </main>
  );
}
