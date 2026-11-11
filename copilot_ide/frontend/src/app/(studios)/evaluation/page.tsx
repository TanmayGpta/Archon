import type { Metadata } from 'next';
import { EvaluationDashboard } from '../../components/EvaluationDashboard';

export const metadata: Metadata = { title: 'Evaluation' };

export default function EvaluationPage() {
  return (
    <main className="w-full min-h-[calc(100vh-56px)]">
      <EvaluationDashboard />
    </main>
  );
}
