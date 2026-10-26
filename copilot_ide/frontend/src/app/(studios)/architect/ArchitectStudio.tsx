"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { parseArchitectLink } from '@/lib/deepLinks';
import { ArcGenStudio } from '../../components/ArcGenStudio';
import { API_BASE } from '@/lib/api';

export function ArchitectStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /architect?view=diagram|components|couplings|atam|validation (read once)
  const [link] = useState(() => parseArchitectLink(searchParams));
  return <ArcGenStudio apiBase={API_BASE} onOpenInIDE={() => router.push('/ide')} initialView={link.view} syncUrl />;
}
