// Loading dial, same look as Conformance Studio's intro: progress arc, ticks and layer-coloured
// beads fill a ring, then the beads burst outward. Pure SVG + CSS (no JS), so it paints at once.
// Used by (studios)/loading.tsx and by the tab links while a route compiles (NavPending).

const R = 80;
const LAYER_COLORS = ['#e8ff00', '#4f9dff', '#6fd38a', '#b48cff', '#ff5c2b', '#e2e2da'];
const BEADS = 24;
const TICKS = 60;

const css = `
@property --sweep { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes dial-fill {
  0% { --sweep: 0deg; opacity: 1; }
  62% { --sweep: 360deg; opacity: 1; }
  86% { --sweep: 360deg; opacity: 1; }
  100% { --sweep: 360deg; opacity: 0; }
}
@keyframes dial-burst {
  0%, 66% { transform: scale(1); opacity: 1; }
  92%, 100% { transform: scale(1.45); opacity: 0; }
}
@keyframes dial-bead {
  0% { transform: rotate(0deg); opacity: 1; }
  62% { transform: rotate(360deg); opacity: 1; }
  86%, 100% { transform: rotate(360deg); opacity: 0; }
}
@keyframes dial-in { from { opacity: 0; } to { opacity: 1; } }
.dial-reveal {
  animation: dial-fill 2.6s cubic-bezier(.65,0,.35,1) infinite;
  -webkit-mask-image: conic-gradient(#000 var(--sweep), transparent 0);
  mask-image: conic-gradient(#000 var(--sweep), transparent 0);
}
.dial-burst { transform-origin: 50% 50%; transform-box: view-box; animation: dial-burst 2.6s ease-in infinite; }
.dial-bead { transform-origin: 50% 50%; animation: dial-bead 2.6s cubic-bezier(.65,0,.35,1) infinite; }
.dial-delayed { opacity: 0; animation: dial-in .25s ease-out .15s forwards; }
@media (prefers-reduced-motion: reduce) {
  .dial-reveal, .dial-burst, .dial-bead { animation: none; -webkit-mask-image: none; mask-image: none; }
}
`;

const point = (i: number, n: number, r: number) => {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2;
  return { x: +(Math.cos(a) * r).toFixed(2), y: +(Math.sin(a) * r).toFixed(2) };
};

export function RouteDial({ label = 'LOADING STUDIO', delayed = false, className = '' }: {
  label?: string;
  // fade in after 150 ms, so instant navigations never flash it
  delayed?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label.toLowerCase()}
      className={`bg-[#080808] flex flex-col items-center justify-center gap-6 ${delayed ? 'dial-delayed' : ''} ${className}`}
    >
      <style>{css}</style>
      <div className="relative w-60 h-60">
        <svg viewBox="-120 -120 240 240" className="absolute inset-0 w-full h-full" aria-hidden>
          <circle r={R + 9} fill="none" stroke="#343434" strokeWidth={1} />
        </svg>

        {/* Arc, ticks and beads revealed clockwise from the top by one conic mask */}
        <div className="absolute inset-0 dial-reveal">
          <svg viewBox="-120 -120 240 240" className="w-full h-full" aria-hidden>
            <circle r={R} fill="none" stroke="rgba(232,255,0,0.55)" strokeWidth={1} />
            <g stroke="rgba(148,148,148,0.6)" strokeWidth={1}>
              {Array.from({ length: TICKS }, (_, i) => {
                const a = point(i, TICKS, R + 6), b = point(i, TICKS, R + (i % 5 ? 11 : 16));
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
              })}
            </g>
            <g className="dial-burst">
              {Array.from({ length: BEADS }, (_, i) => {
                const p = point(i + 0.5, BEADS, R - 14);
                return <circle key={i} cx={p.x} cy={p.y} r={3.2} fill={LAYER_COLORS[i % LAYER_COLORS.length]} />;
              })}
            </g>
          </svg>
        </div>

        {/* Sweeping bead at the head of the arc */}
        <svg viewBox="-120 -120 240 240" className="absolute inset-0 w-full h-full dial-bead" aria-hidden>
          <circle cx={0} cy={-R} r={2.6} fill="#e8ff00" />
        </svg>
      </div>

      <div className="text-center font-mono space-y-1">
        <div className="text-xs tracking-[0.25em] text-[#e8ff00]">{label}</div>
        <div className="text-xs text-[#5a5a58]">first open of a tab is compiled on demand</div>
      </div>
    </div>
  );
}
