"use client";
import { ConformanceStudio } from '../../components/conformance/ConformanceStudio';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE } from '@/lib/api';
import { parseConformanceLink } from '@/lib/deepLinks';

// Client-side so API_BASE resolves against the page's host (see lib/api.ts).
// /conformance?path=&blueprint=&view=&focus= opens that scan, view and module (read once).
export function ConformanceRoute() {
  const searchParams = useSearchParams();
  const [link] = useState(() => parseConformanceLink(searchParams));
  return (
    <ConformanceStudio
      apiBase={API_BASE}
      introScope="studio"
      initialPath={link.path}
      initialBlueprintId={link.blueprint}
      initialView={link.view}
      initialFocus={link.focus}
      syncUrl
    />
  );
}
