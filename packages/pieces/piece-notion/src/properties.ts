type PropertyValue = boolean | number | string | unknown[];

export function buildProperty(type: string, value: PropertyValue) {
  switch (type) {
    case 'checkbox':
      return { checkbox: Boolean(value) };
    case 'date':
      return { date: { start: String(value) } };
    case 'email':
      return { email: String(value) };
    case 'select':
      return { select: { name: String(value) } };
    case 'status':
      return { status: { name: String(value) } };
    case 'number':
      return { number: Number(value) };
    case 'phone_number':
      return { phone_number: String(value) };
    case 'url':
      return { url: String(value) };
    case 'rich_text':
      return { rich_text: [{ type: 'text', text: { content: String(value) } }] };
    case 'title':
      return { title: [{ type: 'text', text: { content: String(value) } }] };
    case 'multi_select':
      return {
        multi_select: (Array.isArray(value) ? value : [value]).map((name) => ({
          name: String(name),
        })),
      };
    case 'people':
      return { people: (Array.isArray(value) ? value : [value]).map((id) => ({ id: String(id) })) };
    default:
      return undefined;
  }
}

export function hasValue(value: unknown): value is PropertyValue {
  return (
    value !== '' &&
    value !== null &&
    value !== undefined &&
    (!Array.isArray(value) || value.length > 0)
  );
}
