import type { Metadata } from 'next';
import { AskStudio } from '../../components/AskAndIdeStudios';

export const metadata: Metadata = { title: 'Ask' };

export default function AskPage() {
  return <AskStudio />;
}
