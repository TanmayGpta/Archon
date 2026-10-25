import { StudioHeader } from './StudioHeader';
import { ModelsProvider } from './ModelsContext';

export default function StudiosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#08090a] text-[#c8ccd0] font-sans antialiased selection:bg-[#2563eb]/30 selection:text-white">
      <StudioHeader />
      <ModelsProvider>{children}</ModelsProvider>
    </div>
  );
}
