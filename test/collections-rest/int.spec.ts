import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { projectsSlug, usersSlug, testUserEmail, testUserPassword } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('collections-rest', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => { booted = await bootFrogbot(dirname); });
  afterAll(async () => { await booted.shutdown(); });
  beforeEach(async () => { await clearAndSeed(booted.frogbot, 'empty'); });

  describe('lifecycle', () => {
    it('GET / returns { ok: true, name: "frogbot" }', async () => {
      const res = await booted.restClient.get('/');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, name: 'frogbot' });
    });

    it('GET /api/users returns an empty paginated result on `empty` scenario', async () => {
      const res = await booted.restClient.get(`/api/${usersSlug}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ docs: [], totalDocs: 0 });
    });
  });

  describe('CRUD', () => {
    it('POST /api/projects creates a new document with 201', async () => {
      const res = await booted.restClient.post(`/api/${projectsSlug}`, {
        title: 'Test Project',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ doc: expect.objectContaining({ title: 'Test Project' }) });
    });

    it('GET /api/projects/:id returns the created document', async () => {
      const created = await booted.restClient.post(`/api/${projectsSlug}`, {
        title: 'Fetch Me',
      });
      const id = (created.body as any).doc.id;
      const res = await booted.restClient.get(`/api/${projectsSlug}/${id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: 'Fetch Me' });
    });

    it('PATCH /api/projects/:id updates the document', async () => {
      const created = await booted.restClient.post(`/api/${projectsSlug}`, {
        title: 'Original',
      });
      const id = (created.body as any).doc.id;
      const res = await booted.restClient.patch(`/api/${projectsSlug}/${id}`, {
        title: 'Updated',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ doc: expect.objectContaining({ title: 'Updated' }) });
    });

    it('DELETE /api/projects/:id removes the document', async () => {
      const created = await booted.restClient.post(`/api/${projectsSlug}`, {
        title: 'Delete Me',
      });
      const id = (created.body as any).doc.id;
      const del = await booted.restClient.delete(`/api/${projectsSlug}/${id}`);
      expect(del.status).toBe(200);

      const res = await booted.restClient.get(`/api/${projectsSlug}/${id}`);
      expect(res.status).toBe(404);
    });

    it('GET /api/projects supports `limit` and `page` pagination', async () => {
      await booted.restClient.post(`/api/${projectsSlug}`, { title: 'A' });
      await booted.restClient.post(`/api/${projectsSlug}`, { title: 'B' });
      await booted.restClient.post(`/api/${projectsSlug}`, { title: 'C' });

      const res = await booted.restClient.get(`/api/${projectsSlug}?limit=2&page=1`);
      expect(res.status).toBe(200);
      expect((res.body as any).docs).toHaveLength(2);
      expect((res.body as any).totalDocs).toBe(3);
    });

    it('GET /api/projects supports `where` filtering', async () => {
      await booted.restClient.post(`/api/${projectsSlug}`, { title: 'Alpha' });
      await booted.restClient.post(`/api/${projectsSlug}`, { title: 'Beta' });

      const res = await booted.restClient.get(
        `/api/${projectsSlug}?where[title][equals]=Alpha`,
      );
      expect(res.status).toBe(200);
      expect((res.body as any).docs).toHaveLength(1);
      expect((res.body as any).docs[0].title).toBe('Alpha');
    });

    it('POST with invalid data returns 400 with validation errors', async () => {
      const res = await booted.restClient.post(`/api/${projectsSlug}`, {});
      expect(res.status).toBe(400);
    });
  });

  describe('errors + 404s', () => {
    it('GET /unknown returns 404', async () => {
      const res = await booted.restClient.get('/unknown');
      expect(res.status).toBe(404);
    });

    it('GET /api/nonexistent-collection returns 404', async () => {
      const res = await booted.restClient.get('/api/nonexistent-collection');
      expect(res.status).toBe(404);
    });
  });
});
