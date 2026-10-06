import { createXml } from '@frogbotai/piece-xml';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const xml = createXml();

const _converted = xml.convertXmlToJson({ input: { xml: '<frog />' }, req });

expectTypeOf<Parameters<typeof xml.convertXmlToJson>[0]['input']>().toEqualTypeOf<{
  xml: string;
  ignoreAttributes?: boolean | undefined;
}>();

const _convertXmlToJsonRejectsConvertJsonToXmlInput = () =>
  // @ts-expect-error convertXmlToJson does not accept convertJsonToXml input
  xml.convertXmlToJson({ input: { json: { frog: true } }, req });
