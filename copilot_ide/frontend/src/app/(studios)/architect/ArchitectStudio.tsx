"use client";
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { parseArchitectLink } from '@/lib/deepLinks';
import { ARCGEN_API_BASE } from '@/lib/api';

// Client-only: ArcGen restores its working state (and any running job) from sessionStorage on
// first render, which the server can't see.
const ArcGenStudio = dynamic(() => import('../../components/ArcGenStudio').then(m => m.ArcGenStudio), { ssr: false });

export function ArchitectStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /architect?view=diagram|components|couplings|atam|validation (read once)
  const [link] = useState(() => parseArchitectLink(searchParams));
  return <ArcGenStudio apiBase={ARCGEN_API_BASE} onOpenInIDE={() => router.push('/ide')} initialView={link.view} syncUrl />;
}
