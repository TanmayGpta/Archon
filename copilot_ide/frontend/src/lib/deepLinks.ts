/* -- Deep links ---------------------------------------------------------
 * Stable URLs that open a studio in a given state. The CLI prints them, e.g.
 *   archon check  ->  /conformance?path=/abs/project&view=violations&focus=app.services.billing
 * Studios read them on load and keep them up to date (history.replaceState),
 * so a copied URL reopens the same view.
 */

export const CONFORMANCE_VIEWS = ['network', 'orbit', 'clusters', 'flow', 'violations'] as const;
export type ConformanceView = (typeof CONFORMANCE_VIEWS)[number];

export const ARCHITECT_VIEWS = ['diagram', 'components', 'couplings', 'atam', 'validation', 'jury'] as const;
export type ArchitectView = (typeof ARCHITECT_VIEWS)[number];

export interface ConformanceLink {
  path?: string;
  blueprint?: string;
  view?: ConformanceView;
  focus?: string;
}

export interface ArchitectLink {
  view?: ArchitectView;
}

export interface IdeLink {
  project?: string;
  file?: string;
  line?: number;
}

type Params = { get(name: string): string | null };

const text = (p: Params, name: string) => p.get(name)?.trim() || undefined;
const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

export function parseConformanceLink(p: Params): ConformanceLink {
  const view = text(p, 'view');
  return {
    path: text(p, 'path'),
    blueprint: text(p, 'blueprint'),
    view: oneOf(view === 'graph' ? 'network' : view, CONFORMANCE_VIEWS),
    focus: text(p, 'focus'),
  };
}

export function parseArchitectLink(p: Params): ArchitectLink {
  return { view: oneOf(text(p, 'view'), ARCHITECT_VIEWS) };
}

export function parseIdeLink(p: Params): IdeLink {
  const line = Number(text(p, 'line'));
  return {
    project: text(p, 'project'),
    file: text(p, 'file')?.replace(/^\/+/, ''),
    line: Number.isInteger(line) && line > 0 ? line : undefined,
  };
}

/** Query string for a link: empty values are left out, key order is fixed. */
export function toQuery(link: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(link)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

export const conformanceUrl = (link: ConformanceLink) => `/conformance${toQuery(link)}`;
export const architectUrl = (link: ArchitectLink) => `/architect${toQuery(link)}`;
export const ideUrl = (link: IdeLink) => `/ide${toQuery(link)}`;

/** Replace the current URL's query without a navigation (keeps scroll, state and history length). */
export function replaceQuery(link: object) {
  if (typeof window === 'undefined') return;
  const next = `${window.location.pathname}${toQuery(link)}`;
  if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
}
