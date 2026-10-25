import { StudioHeader } from './StudioHeader';
import { ModelsProvider } from './ModelsContext';

export default function StudiosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-fg-soft font-sans antialiased selection:bg-accent-strong/30 selection:text-white">
      <StudioHeader />
      <ModelsProvider>{children}</ModelsProvider>
    </div>
  );
}
