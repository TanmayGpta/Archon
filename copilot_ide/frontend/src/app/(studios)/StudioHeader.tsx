"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from '../components/Icons';

const APP_VERSION = 'v1.0';

const STUDIOS = [
  { href: '/ask', label: 'Ask', Icon: Icons.Bolt, activeClass: 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/30 shadow-md' },
  { href: '/ide', label: 'IDE', Icon: Icons.ArchonAI, activeClass: 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/30 shadow-md' },
  { href: '/evaluation', label: 'Evaluation', Icon: Icons.Chart, activeClass: 'bg-[#1e293b] text-[#34d399] border border-[#10b981]/40 shadow-md' },
  { href: '/architect', label: 'Architect', Icon: Icons.Architecture, activeClass: 'bg-[#1e293b] text-[#a78bfa] border border-[#8b5cf6]/40 shadow-md' },
  { href: '/conformance', label: 'Conformance', Icon: Icons.Conformance, activeClass: 'bg-[#1b1b1a] text-[#e8ff00] border border-[#e8ff00]/50 shadow-md' },
];

/* ── Top Universal Header & Studio Nav ─────────────────────── */
export function StudioHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[#161922] bg-[#07080a]/95 backdrop-blur-md sticky top-0 z-50 select-none">
      <div className="max-w-[1400px] mx-auto px-6 h-[56px] flex items-center justify-between">

        <Link href="/ask" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-1.5 shadow-sm">
            <img src="/aionlabs.svg" alt="" className="w-full h-full object-contain" />
          </div>
          <span className="text-[14px] font-semibold text-[#e2e5ea] tracking-tight">
            Archon Copilot
          </span>
        </Link>

        {/* Center Studio Switcher */}
        <nav aria-label="Studios" className="flex items-center p-1 bg-[#0c0e12] border border-[#1a1e26] rounded-xl shadow-inner gap-1">
          {STUDIOS.map(({ href, label, Icon, activeClass }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                  active ? activeClass : 'text-[#64748b] hover:text-[#cbd5e1]'
                }`}
              >
                <Icon />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Hardcoded until real service health lands (UI_IMPROVEMENTS 3.5); the version moves into that popover. */}
        <div
          title={`Archon Copilot ${APP_VERSION}`}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#10b981]/10 border border-[#10b981]/25 rounded-lg text-[11px] font-mono text-[#10b981]"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
          <span>online</span>
        </div>
      </div>
    </header>
  );
}
