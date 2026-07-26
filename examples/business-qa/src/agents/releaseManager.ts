import { dateHelper } from '@frogbotai/piece-date-helper';
import { googleCalendar } from '@frogbotai/piece-google-calendar';
import { googleDrive } from '@frogbotai/piece-google-drive';
import { googleSheets } from '@frogbotai/piece-google-sheets';
import { linear } from '@frogbotai/piece-linear';
import { pdf } from '@frogbotai/piece-pdf';
import { resend } from '@frogbotai/piece-resend';
import type { AgentConfig, FrogbotRequest } from 'frogbot';

const authenticated = ({ req }: { req: FrogbotRequest }) => Boolean(req.user);

export const releaseManager: AgentConfig = {
  slug: 'release-manager',
  model: 'openai/gpt-4o-mini',
  instructions: 'Coordinate an approved release. Make only the narrowly requested updates, report every external change, and ask before sending email.',
  tools: [
    ...googleSheets.tools({ actions: ['insert_row', 'update_row'] }),
    ...googleDrive.tools({ actions: ['create_new_gdrive_folder', 'upload_gdrive_file'] }),
    ...googleCalendar.tools({ actions: ['create_google_calendar_event', 'update_event'] }),
    ...linear.tools({ actions: ['linear_create_issue', 'linear_update_issue', 'linear_create_comment'] }),
    ...resend.tools({ actions: ['send_email'] }),
    ...dateHelper.tools({ actions: ['get_current_date', 'format_date', 'add_subtract_date'] }),
    ...pdf.tools({ actions: ['textToPdf'] }),
  ],
  access: authenticated,
};
