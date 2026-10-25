"use client";
import { useRouter } from 'next/navigation';
import { ArcGenStudio } from '../../components/ArcGenStudio';
import { API_BASE } from '@/lib/api';

export function ArchitectStudio() {
  const router = useRouter();
  return <ArcGenStudio apiBase={API_BASE} onOpenInIDE={() => router.push('/ide')} />;
}
