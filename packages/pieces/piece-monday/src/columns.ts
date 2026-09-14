export type MondayColumnValue = {
  id: string;
  type: string;
  value?: string | null;
  text?: string | null;
  label?: string | null;
  vote_count?: number | null;
  tags?: Array<{ name: string }>;
  linked_item_ids?: string[];
  start_date?: string | null;
  end_date?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(value: string | null | undefined): unknown {
  if (!value) return null;

  return JSON.parse(value) as unknown;
}

export function parseColumnValue(column: MondayColumnValue): unknown {
  const value = json(column.value);
  const record = isRecord(value) ? value : null;

  switch (column.type) {
    case 'button':
    case 'status':
      return column.label ?? null;
    case 'checkbox':
      return record?.checked ?? false;
    case 'board_relation':
    case 'dependency':
      return column.linked_item_ids ?? [];
    case 'color_picker':
      return isRecord(record?.color) ? (record.color.hex ?? null) : null;
    case 'country':
      return record?.countryName ?? null;
    case 'creation_log':
      return record?.created_at ?? null;
    case 'date':
      return record ? `${String(record.date)} ${String(record.time)}` : null;
    case 'doc':
      return Array.isArray(record?.files) && isRecord(record.files[0])
        ? (record.files[0].linkToFile ?? null)
        : null;
    case 'dropdown':
      return record?.ids ?? [];
    case 'email':
      return record?.email ?? null;
    case 'file':
      return column.text ?? null;
    case 'hour':
      return record ? `${String(record.hour)}:${String(record.minute)}` : null;
    case 'item_id':
      return record?.item_id ?? null;
    case 'last_updated':
      return record?.updated_at ?? null;
    case 'link':
      return record?.url ?? null;
    case 'location':
      return record?.address ?? null;
    case 'long_text':
      return record?.text ?? null;
    case 'numbers':
      return value === null ? null : Number(value);
    case 'people':
      return Array.isArray(record?.personsAndTeams)
        ? record.personsAndTeams.filter(isRecord).map((person) => person.id)
        : [];
    case 'phone':
      return record?.phone ?? null;
    case 'rating':
      return record?.rating ?? null;
    case 'subtasks':
      return Array.isArray(record?.linkedPulseIds)
        ? record.linkedPulseIds.filter(isRecord).map((item) => item.linkedPulseId)
        : [];
    case 'tags':
      return column.tags?.map((tag) => tag.name) ?? [];
    case 'text':
      return value;
    case 'timeline':
      return record ? { from: record.from, to: record.to } : null;
    case 'time_tracking':
      return record?.duration ?? null;
    case 'vote':
      return column.vote_count ?? 0;
    case 'week':
      return { startDate: column.start_date, endDate: column.end_date };
    case 'world_clock':
      return record?.timezone ?? null;
    default:
      return null;
  }
}

export function formatColumnValue(type: string, value: unknown): unknown {
  switch (type) {
    case 'checkbox':
      return { checked: value ? 'true' : 'false' };
    case 'board_relation':
    case 'dependency':
      return { item_ids: typeof value === 'string' ? JSON.parse(value) : value };
    case 'country': {
      const [countryCode, countryName] = String(value).split('-');

      return { countryCode, countryName };
    }
    case 'date': {
      const date = new Date(String(value));

      return { date: date.toISOString().slice(0, 10), time: date.toISOString().slice(11, 19) };
    }
    case 'dropdown':
      return { labels: value };
    case 'email':
      return { email: value, text: value };
    case 'hour': {
      const [hour, minute] = String(value).split(':').map(Number);

      return { hour, minute };
    }
    case 'link':
      return { url: value, text: value };
    case 'location': {
      const [lat = '', lng = '', address = ''] = String(value).split('|');

      return { lat, lng, address };
    }
    case 'long_text':
      return { text: value };
    case 'numbers':
      return String(value);
    case 'people':
      if (!Array.isArray(value)) throw new TypeError('Monday people column value must be an array');

      return { personsAndTeams: value.map((id) => ({ id, kind: 'person' })) };
    case 'phone': {
      const [phone, countryShortName] = String(value).split('-');

      return { phone: `+${phone}`, countryShortName };
    }
    case 'rating':
      return { rating: Number(value) };
    case 'status':
      return { label: value };
    case 'timeline': {
      const [from, to] = String(value).split(';');

      return { from, to };
    }
    case 'week': {
      const [startDate, endDate] = String(value).split(';');

      return { startDate, endDate };
    }
    case 'world_clock':
      return { timezone: value };
    default:
      return value;
  }
}
