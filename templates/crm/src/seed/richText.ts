/** Rich text with one paragraph per string, in the editor's stored shape. */
export function paragraphs(...texts: string[]) {
  return {
    root: {
      type: 'root' as const,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
      children: texts.map((text) => ({
        type: 'paragraph' as const,
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        version: 1,
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text' as const,
            text,
            detail: 0,
            format: 0,
            mode: 'normal' as const,
            style: '',
            version: 1,
          },
        ],
      })),
    },
  };
}
