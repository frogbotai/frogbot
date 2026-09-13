import { definePiece, type PieceRunArgs } from 'frogbot/pieces';
import { JSDOM, VirtualConsole } from 'jsdom';
import Showdown from 'showdown';
import slugify from 'slugify';
import { stripHtml as removeHtml } from 'string-strip-html';
import TurndownService from 'turndown';
import { z } from 'zod';

type RunArgs<T extends z.ZodType> = PieceRunArgs<z.output<T>, object, undefined>;

const textOutput = z.string();

const concatTextInput = z.object({
  texts: z.array(z.unknown()).meta({ label: 'Texts' }),
  separator: z.string().optional().meta({
    label: 'Separator',
    description: 'The text that separates the texts you want to concatenate',
  }),
});

const concatText = {
  slug: 'concatText',
  label: 'Concatenate Text',
  description: 'Concatenate two or more texts.',
  input: concatTextInput,
  output: textOutput,
  async run({ input }: RunArgs<typeof concatTextInput>) {
    return input.texts.join(input.separator ?? '');
  },
};

const replaceTextInput = z.object({
  text: z.string().meta({ label: 'Text' }),
  searchValue: z
    .string()
    .meta({ label: 'Search Value', description: 'Plain text or a regex expression.' }),
  replaceValue: z
    .string()
    .optional()
    .meta({ label: 'Replace Value', description: 'Leave empty to delete matches.' }),
  replaceOnlyFirst: z.boolean().default(false).meta({ label: 'Replace Only First Match' }),
});

const replaceText = {
  slug: 'replaceText',
  label: 'Replace Text',
  description: 'Replace matches of a word, character, phrase, or regular expression.',
  input: replaceTextInput,
  output: textOutput,
  async run({ input }: RunArgs<typeof replaceTextInput>) {
    const expression = new RegExp(input.searchValue, input.replaceOnlyFirst ? undefined : 'g');

    return input.text.replace(expression, input.replaceValue ?? '');
  },
};

const splitTextInput = z.object({
  text: z.string().meta({ label: 'Text' }),
  delimiter: z.string().meta({ label: 'Delimiter' }),
});

const splitText = {
  slug: 'splitText',
  label: 'Split Text',
  description: 'Split text by a delimiter.',
  input: splitTextInput,
  output: z.array(z.string()),
  async run({ input }: RunArgs<typeof splitTextInput>) {
    return input.text.split(input.delimiter);
  },
};

const findTextInput = z.object({
  text: z.string().meta({ label: 'Text' }),
  expression: z.string().meta({ label: 'Expression', description: 'Regex or text to search for.' }),
});

const findText = {
  slug: 'findText',
  label: 'Find Text',
  description: 'Find a substring using text or a regular expression.',
  input: findTextInput,
  output: z.array(z.string()).nullable(),
  async run({ input }: RunArgs<typeof findTextInput>) {
    const match = input.text.match(new RegExp(input.expression));

    return match ? Array.from(match) : null;
  },
};

const markdownFlavor = z.enum(['vanilla', 'original', 'github']);
const markdownToHtmlInput = z.object({
  markdown: z.string().meta({ label: 'Markdown Content' }),
  flavor: markdownFlavor.default('github').meta({ label: 'Flavor of Markdown' }),
  headerLevelStart: z
    .number()
    .int()
    .min(1)
    .max(6)
    .default(1)
    .meta({ label: 'Minimum Header Level' }),
  tables: z.boolean().default(true).meta({ label: 'Support Tables' }),
  noHeaderId: z.boolean().default(false).meta({ label: 'No Header ID' }),
  simpleLineBreaks: z.boolean().default(false).meta({ label: 'Simple Line Breaks' }),
  openLinksInNewWindow: z.boolean().default(false).meta({ label: 'Open Links in New Window' }),
});

const convertMarkdownToHtml = {
  slug: 'convertMarkdownToHtml',
  label: 'Convert Markdown to HTML',
  description: 'Convert Markdown to HTML.',
  input: markdownToHtmlInput,
  output: textOutput,
  async run({ input }: RunArgs<typeof markdownToHtmlInput>) {
    const converter = new Showdown.Converter({
      headerLevelStart: input.headerLevelStart,
      omitExtraWLInCodeBlocks: true,
      noHeaderId: input.noHeaderId,
      tables: input.tables,
      simpleLineBreaks: input.simpleLineBreaks,
      openLinksInNewWindow: input.openLinksInNewWindow,
    });

    converter.setFlavor(input.flavor);

    return converter.makeHtml(input.markdown);
  },
};

const htmlInput = z.object({ html: z.string().meta({ label: 'HTML Content' }) });

const convertHtmlToMarkdown = {
  slug: 'convertHtmlToMarkdown',
  label: 'Convert HTML to Markdown',
  description: 'Convert HTML to Markdown.',
  input: htmlInput,
  output: textOutput,
  async run({ input }: RunArgs<typeof htmlInput>) {
    const service = new TurndownService();

    service.remove('script');

    return service.turndown(input.html);
  },
};

const stripHtml = {
  slug: 'stripHtml',
  label: 'Strip HTML',
  description: 'Remove HTML tags and return plain text.',
  input: htmlInput,
  output: textOutput,
  async run({ input }: RunArgs<typeof htmlInput>) {
    return removeHtml(input.html).result;
  },
};

const textInput = z.object({ text: z.string().meta({ label: 'Text' }) });

const slugifyText = {
  slug: 'slugifyText',
  label: 'Slugify Text',
  description: 'Convert text to a URL-friendly slug.',
  input: textInput,
  output: textOutput,
  async run({ input }: RunArgs<typeof textInput>) {
    return slugify(input.text);
  },
};

const defaultValueInput = z.object({
  value: z
    .union([z.string(), z.array(z.unknown())])
    .optional()
    .meta({ label: 'Value' }),
  defaultValue: z.string().meta({ label: 'Default Value' }),
});

const useDefaultValue = {
  slug: 'useDefaultValue',
  label: 'Use Default Value',
  description: 'Return a default value when the input is empty.',
  input: defaultValueInput,
  output: z.union([z.string(), z.array(z.unknown())]),
  async run({ input }: RunArgs<typeof defaultValueInput>) {
    if (input.value === undefined || input.value === '' || input.value.length === 0) {
      return input.defaultValue;
    }

    return input.value;
  },
};

const tableRow = z.record(z.string(), z.unknown());
const createTextTableInput = z.object({ data: z.array(tableRow).meta({ label: 'List' }) });

const createTextTable = {
  slug: 'createTextTable',
  label: 'Create Text Table',
  description: 'Convert a list of objects to an ASCII text table.',
  input: createTextTableInput,
  output: textOutput,
  async run({ input }: RunArgs<typeof createTextTableInput>) {
    if (input.data.length === 0) return '';

    const keys = Array.from(new Set(input.data.flatMap((row) => Object.keys(row))));
    const widths = keys.map((key) =>
      Math.max(key.length, ...input.data.map((row) => String(row[key] ?? '').length)),
    );
    const separator = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
    const header = `|${keys.map((key, index) => ` ${key.padEnd(widths[index])} `).join('|')}|`;

    const rows = input.data.map(
      (row) =>
        `|${keys.map((key, index) => ` ${String(row[key] ?? '').padEnd(widths[index])} `).join('|')}|`,
    );

    return [separator, header, separator, ...rows, separator].join('\n');
  },
};

const extractionTarget = z.enum(['title', 'links', 'images', 'headings', 'paragraphs', 'custom']);
const extractionType = z.enum(['textContent', 'innerHtml', 'outerHtml', 'attribute']);
const extractFromHtmlInput = z.object({
  html: z.string().meta({ label: 'HTML Content' }),
  target: extractionTarget.default('title').meta({ label: 'Extraction Target' }),
  selector: z.string().optional().meta({ label: 'Custom CSS Selector' }),
  extractionType: extractionType.default('textContent').meta({ label: 'Extraction Type' }),
  attributeName: z.string().optional().meta({ label: 'Attribute Name' }),
  returnMultiple: z.boolean().default(false).meta({ label: 'Return Multiple Elements' }),
});

const extractFromHtml = {
  slug: 'extractFromHtml',
  label: 'Extract from HTML',
  description: 'Extract specific elements or data from an HTML document.',
  input: extractFromHtmlInput,
  output: z.union([z.string(), z.array(z.string()), z.null()]),
  async run({ input }: RunArgs<typeof extractFromHtmlInput>) {
    const selectors = {
      title: 'title',
      links: 'a[href]',
      images: 'img[src]',
      headings: 'h1, h2, h3',
      paragraphs: 'p',
    } as const;

    if (input.target === 'custom' && !input.selector) {
      throw new Error('You must provide a "Custom CSS Selector" when the target is set to Custom.');
    }

    if (input.extractionType === 'attribute' && !input.attributeName) {
      throw new Error(
        'You must provide an "Attribute Name" when the extraction type is Attribute.',
      );
    }

    const selector = input.target === 'custom' ? input.selector! : selectors[input.target];
    const dom = new JSDOM(input.html, {
      includeNodeLocations: false,
      virtualConsole: new VirtualConsole(),
    });

    try {
      let elements: NodeListOf<Element>;

      try {
        elements = dom.window.document.querySelectorAll(selector);
      } catch (error) {
        throw new Error(
          `Invalid CSS selector: "${selector}". Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const extract = (element: Element) => {
        if (input.extractionType === 'innerHtml') return element.innerHTML;
        if (input.extractionType === 'outerHtml') return element.outerHTML;
        if (input.extractionType === 'attribute') {
          return element.getAttribute(input.attributeName!) ?? '';
        }

        return element.textContent?.trim() ?? '';
      };

      if (input.returnMultiple) return Array.from(elements, extract);

      return elements[0] ? extract(elements[0]) : null;
    } finally {
      dom.window.close();
    }
  },
};

export const createTextHelper = definePiece({
  slug: 'text-helper',
  label: 'Text Helper',
  admin: { description: 'Tools for text processing', group: 'Core' },
  actions: [
    concatText,
    replaceText,
    splitText,
    findText,
    convertMarkdownToHtml,
    convertHtmlToMarkdown,
    stripHtml,
    slugifyText,
    useDefaultValue,
    createTextTable,
    extractFromHtml,
  ],
});
