import { fileURLToPath } from 'node:url';

export const databasePath = fileURLToPath(new URL('./select.db', import.meta.url));

export const postsSlug = 'select-posts';
export const usersSlug = 'select-users';
