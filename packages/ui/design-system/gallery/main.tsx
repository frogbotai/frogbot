import './gallery.css';

import { createRoot } from 'react-dom/client';

import { ActivitySection, ListCellsSection, RecordSection, ReportSection } from './composites.js';
import {
  ChartSection,
  ChipSection,
  CopySection,
  EmptySection,
  FactSection,
  MediaSection,
  MeterSection,
  PageHeaderSection,
  ReadMoreSection,
  StatSection,
  StatusSection,
  ValueSection,
} from './primitives.js';

const theme = new URLSearchParams(location.search).get('theme');

if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;

function Gallery() {
  return (
    <main className="gallery">
      <ValueSection />
      <StatSection />
      <ChartSection />
      <FactSection />
      <StatusSection />
      <ChipSection />
      <MeterSection />
      <ReportSection />
      <ActivitySection />
      <EmptySection />
      <PageHeaderSection />
      <ReadMoreSection />
      <MediaSection />
      <CopySection />
      <ListCellsSection />
      <RecordSection />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
