# `@frogbotai/piece-xml`

Convert data between JSON and XML without a configured credential.

## Usage

```ts
import { createXml } from '@frogbotai/piece-xml';

export const xml = createXml();
```

## Actions

| Upstream action slug  | Previous wrapper export | Native action      | Notes                                                       |
| --------------------- | ----------------------- | ------------------ | ----------------------------------------------------------- |
| `convert-json-to-xml` | `convertJsonToXml`      | `convertJsonToXml` | Preserves custom attribute fields and optional XML headers. |
| `convert-xml-to-json` | `convertXmlToJson`      | `convertXmlToJson` | Preserves attributes by default with the `@_` prefix.       |
