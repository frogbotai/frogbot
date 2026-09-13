# `@frogbotai/piece-text-helper`

Text conversion, search, formatting, and HTML extraction tools for FrogBot.

## Usage

```ts
import { createTextHelper } from '@frogbotai/piece-text-helper';

export const textHelper = createTextHelper();
```

## Actions

| Upstream action slug  | Previous wrapper export | Native action           | Notes                                                     |
| --------------------- | ----------------------- | ----------------------- | --------------------------------------------------------- |
| `concat`              | `concat`                | `concatText`            |                                                           |
| `replace`             | `replace`               | `replaceText`           |                                                           |
| `split`               | `split`                 | `splitText`             |                                                           |
| `find`                | `find`                  | `findText`              |                                                           |
| `markdown_to_html`    | `markdownToHtml`        | `convertMarkdownToHtml` |                                                           |
| `html_to_markdown`    | `htmlToMarkdown`        | `convertHtmlToMarkdown` |                                                           |
| `stripHtml`           | `stripHtml`             | `stripHtml`             |                                                           |
| `slugify`             | `slugify`               | `slugifyText`           |                                                           |
| `defaultValue`        | `defaultValue`          | `useDefaultValue`       | Input `defaultString` is now the semantic `defaultValue`. |
| `json_to_ascii_table` | `jsonToAsciiTable`      | `createTextTable`       | Validates that input is a list of objects.                |
| `extract_from_html`   | `extractFromHtml`       | `extractFromHtml`       |                                                           |

The upstream piece registers no triggers.
