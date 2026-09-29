import { createPdf } from '@frogbotai/piece-pdf';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const pdf = createPdf();

const created = pdf.createPdfFromText({ input: { text: 'Hello' }, req });

expectTypeOf<Parameters<typeof pdf.createPdfFromText>[0]['input']>().toEqualTypeOf<{
  text: string;
}>();
expectTypeOf(created).toEqualTypeOf<
  Promise<{ id: string | number; filename: string; url?: string | undefined }>
>();

// @ts-expect-error createPdfFromText does not accept countPdfPages input
pdf.createPdfFromText({ input: { file: 1 }, req });

expectTypeOf(pdf.countPdfPages({ input: { file: 1 }, req })).toEqualTypeOf<Promise<number>>();
