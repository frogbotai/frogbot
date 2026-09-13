import type { AgentConfig, FrogbotRequest } from 'frogbot';
import { z } from 'zod';

import {
  dataSummarizer,
  dateHelper,
  googleCalendar,
  googleDrive,
  googleSheets,
  pdf,
} from '../pieces';

const authenticated = ({ req }: { req: FrogbotRequest }) => Boolean(req.user);
const releaseRisk = {
  slug: 'release_risk_score',
  description: 'Scores release risk from blocker count and launch timing.',
  inputSchema: z.object({ openBlockers: z.number(), daysToLaunch: z.number() }),
  execute: ({
    openBlockers,
    daysToLaunch,
  }: {
    openBlockers: number;
    daysToLaunch: number;
  }) => ({
    score: Math.min(100, openBlockers * 20 + (daysToLaunch < 3 ? 30 : 0)),
  }),
};

export const qaAnalyst: AgentConfig = {
  slug: 'qa-analyst',
  model: 'openai/gpt-4o-mini',
  instructions:
    'Assess release readiness from connected source material. Read and summarize evidence, identify gaps, and never mutate external systems. Drive downloads return saved file references, not extracted text. Use PDF extraction for PDFs; report content you cannot extract as an evidence gap.',
  tools: [
    googleSheets.findRows,
    googleSheets.getRows,
    googleDrive.downloadFile,
    googleDrive.getFile,
    googleDrive.listFiles,
    googleCalendar.listEvents,
    googleCalendar.findFreeBusyPeriods,
    googleCalendar.getEvent,
    dateHelper.getCurrentDate,
    dateHelper.dateDifference,
    dataSummarizer.calculateAverage,
    dataSummarizer.countUniqueValues,
    dataSummarizer.findMinMax,
    pdf.extractPdfText,
    pdf.countPdfPages,
    releaseRisk,
  ],
  access: authenticated,
};
