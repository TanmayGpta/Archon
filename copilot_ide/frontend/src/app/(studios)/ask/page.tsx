import type { Metadata } from 'next';
import { AskStudio } from './AskStudio';

export const metadata: Metadata = { title: 'Ask' };

export default function AskPage() {
  return <AskStudio />;
}
