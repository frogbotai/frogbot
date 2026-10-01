import type { FrogBotInstance, TranscribeAudio } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const frogbot: FrogBotInstance;
declare const stream: ReadableStream<Uint8Array>;

expectTypeOf(Buffer.from('audio')).toExtend<TranscribeAudio>();
expectTypeOf(new Uint8Array()).toExtend<TranscribeAudio>();
expectTypeOf(new ArrayBuffer(1)).toExtend<TranscribeAudio>();
expectTypeOf(new Blob()).toExtend<TranscribeAudio>();
expectTypeOf(stream).toExtend<TranscribeAudio>();
expectTypeOf(new URL('https://example.com/clip.mp3')).toExtend<TranscribeAudio>();
expectTypeOf('UklGRg==').toExtend<TranscribeAudio>();
expectTypeOf(42).not.toExtend<TranscribeAudio>();

void frogbot.transcribe({
  model: 'groq/whisper-large-v3',
  audio: Buffer.from('audio'),
  language: 'fr',
});
