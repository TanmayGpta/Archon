"use client";
import '@xterm/xterm/css/xterm.css';
import React, { useEffect, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { COMMANDS, matchesKeys } from '@/lib/commands';
import { prefersReducedMotion } from '@/lib/motion';
import { inputMessage, parsePtyEvent, ptyUrl, refreshRunner, resizeMessage, RUNNER_URL } from '@/lib/runner';

/* -- One shell on the user's machine, through the local runner ----------- */

// Per tab: read the scrollback (Copy button) and focus the terminal (Ctrl+`)
const buffers = new Map<string, () => string>();
const focusers = new Map<string, () => void>();
export const terminalText = (id: string) => buffers.get(id)?.() ?? '';
export const focusTerminal = (id: string) => focusers.get(id)?.();

const DIM = '\x1b[90m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function theme() {
  const css = getComputedStyle(document.documentElement);
  const c = (name: string, fallback: string) => css.getPropertyValue(`--color-${name}`).trim() || fallback;
  const red = c('danger-fg', '#f87171');
  const green = c('success-fg', '#34d399');
  const yellow = c('warning-fg', '#fbbf24');
  const blue = c('accent-fg', '#60a5fa');
  const magenta = c('ai', '#a78bfa');
  const cyan = c('info', '#38bdf8');
  return {
    background: c('canvas', '#08090a'),
    foreground: c('fg', '#e2e5ea'),
    cursor: blue,
    cursorAccent: c('canvas', '#08090a'),
    selectionBackground: c('selected', '#1e293b'),
    black: c('raised', '#12151c'), brightBlack: c('fg-subtle', '#7d8799'),
    red, brightRed: red, green, brightGreen: green, yellow, brightYellow: yellow,
    blue, brightBlue: blue, magenta, brightMagenta: magenta, cyan, brightCyan: cyan,
    white: c('fg-soft', '#cbd5e1'), brightWhite: c('fg-strong', '#f8fafc'),
  };
}

export function XtermView({ id, active }: { id: string; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<{ term: Terminal; fit: () => void } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let term: Terminal | null = null;
    let ws: WebSocket | null = null;
    let observer: ResizeObserver | null = null;
    // 'ended': the shell exited or the connection dropped; Enter starts a new one
    let session: 'connecting' | 'open' | 'ended' = 'connecting';

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed) return;
      const t = new Terminal({
        fontFamily: getComputedStyle(host).fontFamily,
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: !prefersReducedMotion(),
        scrollback: 5000,
        theme: theme(),
      });
      term = t;
      const fitAddon: FitAddon = new FitAddon();
      t.loadAddon(fitAddon);
      t.open(host);
      const fit = () => { if (host.clientWidth > 0 && host.clientHeight > 0) fitAddon.fit(); };
      fit();
      viewRef.current = { term: t, fit };

      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      t.attachCustomKeyEventHandler(e => {
        if (e.type !== 'keydown') return true;
        // IDE shortcuts (Ctrl+P, Ctrl+S, Ctrl+`, Alt+W) go to the IDE, not the shell
        if (COMMANDS.some(c => c.keys && matchesKeys(e, c.keys, mac))) return false;
        const mod = mac ? e.metaKey : e.ctrlKey;
        const key = e.key.toLowerCase();
        // Ctrl+C copies when text is selected, otherwise it interrupts
        if (mod && key === 'c' && t.hasSelection()) {
          void navigator.clipboard?.writeText(t.getSelection());
          t.clearSelection();
          return false;
        }
        // Let the browser paste; xterm picks up the paste event
        if (mod && key === 'v') return false;
        return true;
      });

      const connect = () => {
        session = 'connecting';
        let opened = false;
        const socket = new WebSocket(ptyUrl(t.cols, t.rows));
        ws = socket;
        socket.binaryType = 'arraybuffer';
        socket.onopen = () => { opened = true; session = 'open'; };
        socket.onmessage = ev => {
          if (typeof ev.data !== 'string') {
            t.write(new Uint8Array(ev.data as ArrayBuffer));
            return;
          }
          const event = parsePtyEvent(ev.data);
          if (event?.type === 'exit') {
            session = 'ended';
            t.write(`\r\n${DIM}[Shell exited${event.code != null ? ` with code ${event.code}` : ''}. Press Enter to start a new one.]${RESET}\r\n`);
          } else if (event?.type === 'error') {
            session = 'ended';
            t.write(`${RED}${event.message}${RESET}\r\n`);
          }
        };
        socket.onclose = () => {
          if (disposed || ws !== socket || session === 'ended') return;
          session = 'ended';
          t.write(opened
            ? `\r\n${DIM}[Lost the connection to the runner. Press Enter to reconnect.]${RESET}\r\n`
            : `${RED}Could not connect to the runner at ${RUNNER_URL}.${RESET} ${DIM}Is \`archon\` still running? Press Enter to retry.${RESET}\r\n`);
          void refreshRunner();
        };
      };

      t.onData(data => {
        if (session === 'ended') {
          if (data === '\r') { t.reset(); connect(); }
          return;
        }
        if (ws?.readyState === WebSocket.OPEN) ws.send(inputMessage(data));
      });
      t.onResize(({ cols, rows }) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(resizeMessage(cols, rows));
      });
      observer = new ResizeObserver(fit);
      observer.observe(host);

      buffers.set(id, () => {
        const buf = t.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '');
        return lines.join('\n').trimEnd();
      });
      focusers.set(id, () => t.focus());
      connect();
      t.focus();
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      ws?.close();
      term?.dispose();
      viewRef.current = null;
      buffers.delete(id);
      focusers.delete(id);
    };
  }, [id]);

  // Switching to this tab: it may have been resized while hidden
  useEffect(() => {
    if (!active) return;
    viewRef.current?.fit();
    viewRef.current?.term.focus();
  }, [active]);

  return <div ref={hostRef} role="group" aria-label="Terminal" className={`h-full w-full font-mono ${active ? '' : 'hidden'}`} />;
}
