import { z } from 'zod';

export const discordAuth = z.object({
  botToken: z.string().min(1).meta({ label: 'Bot token', secret: true }),
});

export const discordOptions = z.object({
  apiUrl: z.url().optional().meta({ label: 'API URL' }),
  applicationId: z.string().min(1).optional().meta({ label: 'Application ID' }),
  publicKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Public key must be a 64-character hexadecimal value.')
    .optional()
    .meta({ label: 'Public key' }),
  botUsername: z.string().min(1).optional().meta({ label: 'Bot username' }),
  mentionRoleIds: z.array(z.string().min(1)).default([]).meta({ label: 'Mention role IDs' }),
  respondToChannelIds: z
    .array(z.string().min(1))
    .default([])
    .meta({ label: 'Always respond in channel IDs' }),
  respondToGlobalMentions: z
    .boolean()
    .default(false)
    .meta({ label: 'Respond to @everyone and @here' }),
});

export const guildId = z.string().min(1).meta({ label: 'Guild' });
export const channelId = z.string().min(1).meta({ label: 'Channel' });
export const roleId = z.string().min(1).meta({ label: 'Role' });
