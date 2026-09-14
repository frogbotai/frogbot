import { z } from 'zod';

export const discordAuth = z.object({
  botToken: z.string().min(1).meta({ label: 'Bot token', secret: true }),
});

export const discordOptions = z.object({});

export const guildId = z.string().min(1).meta({ label: 'Guild' });
export const channelId = z.string().min(1).meta({ label: 'Channel' });
export const roleId = z.string().min(1).meta({ label: 'Role' });
