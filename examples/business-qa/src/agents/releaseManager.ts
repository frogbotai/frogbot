import type { AgentConfig, FrogbotRequest } from 'frogbot';

import {
  dateHelper,
  googleCalendar,
  googleDrive,
  googleSheets,
  linear,
  pdf,
  resend,
} from '../pieces';

const authenticated = ({ req }: { req: FrogbotRequest }) => Boolean(req.user);

export const releaseManager: AgentConfig = {
  slug: 'release-manager',
  model: 'openai/gpt-4o-mini',
  instructions:
    'Coordinate an approved release. Make only the narrowly requested updates, report every external change, and ask before sending email.',
  tools: [
    googleSheets.insertRow,
    googleSheets.updateRow,
    googleDrive.createNewGdriveFolder,
    googleDrive.uploadGdriveFile,
    googleCalendar.createGoogleCalendarEvent,
    googleCalendar.updateEvent,
    linear.linearCreateIssue,
    linear.linearUpdateIssue,
    linear.linearCreateComment,
    resend.sendEmail,
    dateHelper.getCurrentDate,
    dateHelper.formatDate,
    dateHelper.addSubtractDate,
    pdf.textToPdf,
  ],
  access: authenticated,
};
