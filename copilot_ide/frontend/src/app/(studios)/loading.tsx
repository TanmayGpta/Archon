import { RouteDial } from '../components/RouteDial';

// Shown while a studio tab's page streams in. The click-time overlay for routes that are still
// compiling lives in StudioHeader (NavPending), since this fallback only arrives after the compile.
export default function Loading() {
  return <RouteDial className="min-h-[calc(100vh-56px)]" />;
}
