"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from '../components/Icons';
import { ServiceStatus } from './ServiceStatus';

const APP_VERSION = 'v1.0';

const STUDIOS = [
  { href: '/ask', label: 'Ask', Icon: Icons.Bolt, activeClass: 'bg-selected text-accent-fg border border-accent/30 shadow-md' },
  { href: '/ide', label: 'IDE', Icon: Icons.ArchonAI, activeClass: 'bg-selected text-accent-fg border border-accent/30 shadow-md' },
  { href: '/evaluation', label: 'Evaluation', Icon: Icons.Chart, activeClass: 'bg-selected text-success-fg border border-success/40 shadow-md' },
  { href: '/architect', label: 'Architect', Icon: Icons.Architecture, activeClass: 'bg-selected text-ai border border-[#8b5cf6]/40 shadow-md' },
  { href: '/conformance', label: 'Conformance', Icon: Icons.Conformance, activeClass: 'bg-[#1b1b1a] text-[#e8ff00] border border-[#e8ff00]/50 shadow-md' },
];

/* ── Top Universal Header & Studio Nav ─────────────────────── */
export function StudioHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-line-subtle bg-canvas/95 backdrop-blur-md sticky top-0 z-50 select-none">
      <div className="max-w-[1400px] mx-auto px-6 h-[56px] flex items-center justify-between">

        <Link href="/ask" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-raised border border-line flex items-center justify-center p-1.5 shadow-sm">
            <img src="/aionlabs.svg" alt="" className="w-full h-full object-contain" />
          </div>
          <span className="text-lg font-semibold text-fg tracking-tight">
            Archon Copilot
          </span>
        </Link>

        {/* Center Studio Switcher */}
        <nav aria-label="Studios" className="flex items-center p-1 bg-surface border border-line rounded-xl shadow-inner gap-1">
          {STUDIOS.map(({ href, label, Icon, activeClass }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-mono font-semibold transition-all cursor-pointer ${
                  active ? activeClass : 'text-fg-subtle hover:text-fg-soft'
                }`}
              >
                <Icon />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <ServiceStatus appVersion={APP_VERSION} />
      </div>
    </header>
  );
}
