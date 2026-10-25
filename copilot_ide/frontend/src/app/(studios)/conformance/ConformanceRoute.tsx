"use client";
import { ConformanceStudio } from '../../components/conformance/ConformanceStudio';
import { API_BASE } from '@/lib/api';

// Client-side so API_BASE resolves against the page's host (see lib/api.ts).
export function ConformanceRoute() {
  return <ConformanceStudio apiBase={API_BASE} introScope="studio" />;
}
