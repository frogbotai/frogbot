import { describe, expect, it } from 'vitest';

import type { Piece } from '../types/piece.js';

export function pieceContract({ piece, service, credentialType, actions }: {
  piece: Piece;
  service: string;
  credentialType: Piece['credentialType'];
  actions: readonly string[];
}): void {
  describe(`${service} piece contract`, () => {
    it('declares matching metadata', () => {
      expect(piece.service).toBe(service);
      expect(piece.credentialType).toBe(credentialType);
      expect(piece.actions).toEqual(expect.arrayContaining([...actions]));
    });
    it('creates valid default tools', () => {
      const tools = piece.tools();
      expect(tools).toHaveLength(actions.length);
      for (const tool of tools) {
        expect(tool.slug.startsWith(`${service}_`)).toBe(true);
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema.safeParse({})).toBeDefined();
      }
    });
    it('filters tools by action', () => {
      const action = actions[0];
      expect(piece.tools({ actions: [action] }).map((tool) => tool.slug)).toEqual([`${service}_${action}`]);
    });
  });
}
