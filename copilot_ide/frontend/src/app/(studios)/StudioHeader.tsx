"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icons } from '../components/Icons';
import { ServiceStatus } from './ServiceStatus';
import { usePaletteShortcut } from './CommandPalette';
import { useOpenCommandPalette } from '../components/commandsContext';

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
  const openPalette = useOpenCommandPalette();
  const shortcut = usePaletteShortcut();

  return (
    <header className="border-b border-line-subtle bg-canvas/95 backdrop-blur-md sticky top-0 z-50 select-none">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 h-[56px] flex items-center justify-between gap-2">

        <Link href="/ask" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-panel bg-raised border border-line flex items-center justify-center p-1.5">
            <img src="/aionlabs.svg" alt="" className="w-full h-full object-contain" />
          </div>
          <span className="hidden lg:inline text-lg font-semibold text-fg tracking-tight">
            Archon Copilot
          </span>
        </Link>

        {/* Center Studio Switcher */}
        <nav aria-label="Studios" className="flex items-center p-1 bg-surface border border-line rounded-panel shadow-inner gap-0.5 sm:gap-1 min-w-0">
          {STUDIOS.map(({ href, label, Icon, activeClass }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                title={label}
                className={`flex items-center gap-2 px-2 sm:px-3.5 py-1.5 rounded-panel text-sm font-mono font-semibold transition-all cursor-pointer ${
                  active ? activeClass : 'text-fg-subtle hover:text-fg-soft'
                }`}
              >
                <Icon />
                {/* Icons only on narrow screens; the label stays for screen readers */}
                <span className="sr-only md:not-sr-only">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={openPalette}
            aria-label={`Command palette (${shortcut})`}
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-control border border-line bg-surface text-xs text-fg-muted hover:text-fg-soft hover:border-line-strong cursor-pointer"
          >
            <span>Commands</span>
            <kbd className="font-mono text-fg-subtle">{shortcut}</kbd>
          </button>
          <ServiceStatus appVersion={APP_VERSION} />
        </div>
      </div>
    </header>
  );
}
