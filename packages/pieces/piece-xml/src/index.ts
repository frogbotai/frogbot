import { definePiece } from 'frogbot/pieces';

import { convertJsonToXml } from './actions/convertJsonToXml.js';
import { convertXmlToJson } from './actions/convertXmlToJson.js';

export const createXml = definePiece({
  slug: 'xml',
  label: 'XML',
  admin: {
    description: 'Convert data between JSON and Extensible Markup Language formats',
    group: 'Core',
  },
  actions: [convertJsonToXml, convertXmlToJson],
});
