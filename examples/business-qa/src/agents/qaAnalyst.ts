import { dataSummarizer } from '@frogbotai/piece-data-summarizer';
import { dateHelper } from '@frogbotai/piece-date-helper';
import { googleCalendar } from '@frogbotai/piece-google-calendar';
import { googleDrive } from '@frogbotai/piece-google-drive';
import { googleSheets } from '@frogbotai/piece-google-sheets';
import { pdf } from '@frogbotai/piece-pdf';
import type { AgentConfig, FrogbotRequest } from 'frogbot';

const authenticated = ({ req }: { req: FrogbotRequest }) => Boolean(req.user);

export const qaAnalyst: AgentConfig = {
  slug: 'qa-analyst',
  model: 'openai/gpt-4o-mini',
  instructions: 'Assess release readiness from connected source material. Read and summarize evidence, identify gaps, and never mutate external systems.',
  tools: [
    ...googleSheets.tools({ actions: ['find_rows', 'get-many-rows'] }),
    ...googleDrive.tools({ actions: ['read-file', 'get-file-or-folder-by-id', 'list-files'] }),
    ...googleCalendar.tools({ actions: ['google_calendar_get_events', 'google_calendar_find_busy_free_periods', 'google_calendar_get_event_by_id'] }),
    ...dateHelper.tools({ actions: ['get_current_date', 'date_difference'] }),
    ...dataSummarizer.tools({ actions: ['calculateAverage', 'countUniques', 'getMinMax'] }),
    ...pdf.tools({ actions: ['extractText', 'pdfPageCount'] }),
  ],
  access: authenticated,
};
