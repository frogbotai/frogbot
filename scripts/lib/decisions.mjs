import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const OPEN = 'open_decisions.md';

export const RULINGS = 'decisions.md';

const ARCHIVED_RULINGS = path.join('archive', 'decisions.md');

const CARD = /^### (?:(\d+) )?(D\d+)\b\s*(?:—\s*)?(.*)$/;

const ANSWER = /^(\s*(?:-\s*)?)(?:\*\*Answer:\*\*|Answer:)(.*)$/;

const APPLIES = /^\s*-?\s*\*\*Applies to:\*\*\s*(.*)$/;

const OPTIONS = /^\s*-?\s*\*\*Options\.\*\*\s*(.*)$/;

const SPEC_SECTION = /^## (\d+) — /;

const BATCH_SECTION = /^## Batch (\S+) plans$/;

const GATE = /^(Approve|Go):(.*)$/;

const STATUS = /^Status:\s*(.*)$/m;

const RULING_ID = /^- DR-(\d+)\b/gm;

const YES = /^yes\.?$/i;

const THIS_TICKET = /^this ticket\.?$/i;

function statusOf(text) {
  return STATUS.exec(text ?? '')?.[1].trim() ?? '';
}

function setStatus(text, status) {
  return text.replace(STATUS, `Status: ${status}`);
}

function isDraft(text) {
  return /^Draft\b/.test(statusOf(text));
}

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === '') start++;

  while (end > start && lines[end - 1].trim() === '') end--;

  return lines.slice(start, end);
}

function textAfter(lines, index, first) {
  const rest = [];

  for (const line of lines.slice(index + 1)) {
    if (line.startsWith('#') || GATE.test(line)) break;

    rest.push(line.trim());
  }

  return trimBlank([first.trim(), ...rest])
    .join('\n')
    .trim();
}

function section(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === heading);

  if (start === -1) return [];

  const end = lines.findIndex((line, index) => index > start && /^##? /.test(line));

  return trimBlank(lines.slice(start + 1, end === -1 ? lines.length : end));
}

export function parseCards(text) {
  const lines = text.split('\n');
  const cards = [];

  for (const [index, line] of lines.entries()) {
    if (!/^##+ /.test(line)) continue;

    if (cards.length > 0 && cards.at(-1).end === lines.length) cards.at(-1).end = index;

    const heading = CARD.exec(line);

    if (heading) {
      cards.push({ id: heading[2], title: heading[3].trim(), start: index, end: lines.length });
    }
  }

  return cards.map((card) => {
    const body = lines.slice(card.start, card.end);
    const answerAt = body.findIndex((line) => ANSWER.test(line));
    const applies = body.map((line) => APPLIES.exec(line)?.[1]).find((value) => value != null);
    const options = body.map((line) => OPTIONS.exec(line)?.[1]).find((value) => value != null);

    return {
      ...card,
      lines: trimBlank(body),
      answerLine: answerAt === -1 ? null : card.start + answerAt,
      answer: answerAt === -1 ? '' : textAfter(body, answerAt, ANSWER.exec(body[answerAt])[2]),
      topic: applies == null ? null : topicOf(applies),
      options: options ?? '',
    };
  });
}

function topicOf(applies) {
  const topic = applies
    .replaceAll('`', '')
    .replace(/^decisions\.md\s*(?:topic:?)?\s*/i, '')
    .replace(/^#+\s*/, '')
    .trim();

  return topic === '' || THIS_TICKET.test(topic) ? null : topic;
}

export function parseOpen(text) {
  const specs = new Map();
  const batches = new Map();
  const lines = text.split('\n');
  let current = null;

  for (const [index, line] of lines.entries()) {
    const spec = SPEC_SECTION.exec(line);
    const batch = BATCH_SECTION.exec(line);

    if (spec) {
      current = { kind: 'spec', ticket: Number(spec[1]), cards: new Map(), approve: '' };
      specs.set(current.ticket, current);
      continue;
    }

    if (batch) {
      current = { kind: 'batch', batch: batch[1], go: '' };
      batches.set(current.batch, current);
      continue;
    }

    if (/^## /.test(line)) {
      current = null;
      continue;
    }

    if (!current) continue;

    const gate = GATE.exec(line);

    if (gate && gate[1] === 'Approve' && current.kind === 'spec') {
      current.approve = textAfter(lines, index, gate[2]);
    } else if (gate && gate[1] === 'Go' && current.kind === 'batch') {
      current.go = textAfter(lines, index, gate[2]);
    }
  }

  for (const spec of specs.values()) {
    const start = lines.findIndex((line) => SPEC_SECTION.exec(line)?.[1] === String(spec.ticket));
    const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
    const own = lines.slice(start, end === -1 ? lines.length : end).join('\n');

    for (const card of parseCards(own)) {
      if (card.answer) spec.cards.set(card.id, card.answer);
    }
  }

  return { specs, batches };
}

function answerLines(prefix, label, answer) {
  const [first, ...rest] = answer.split('\n');

  return [`${prefix}${label} ${first}`, ...rest.map((line) => (line ? `  ${line}` : ''))];
}

export function writeAnswer(text, card, answer) {
  const lines = text.split('\n');

  if (card.answerLine === null) {
    const last = card.start + card.lines.length;

    lines.splice(last, 0, ...answerLines('- ', '**Answer:**', answer));
  } else {
    const prefix = ANSWER.exec(lines[card.answerLine])[1];
    const label = lines[card.answerLine].includes('**Answer:**') ? '**Answer:**' : 'Answer:';
    let end = card.answerLine + 1;

    while (end < card.end && lines[end].trim() !== '' && !lines[end].startsWith('#')) end++;

    lines.splice(card.answerLine, end - card.answerLine, ...answerLines(prefix, label, answer));
  }

  return lines.join('\n');
}

export function addOwnerNote(text, date, note) {
  const entry = answerLines('- ', `${date}:`, note).join('\n');

  if (text.includes(entry)) return text;

  const lines = text.replace(/\n+$/, '').split('\n');
  const heading = lines.findIndex((line) => line.trim() === '## Owner notes');

  if (heading === -1) return `${lines.join('\n')}\n\n## Owner notes\n\n${entry}\n`;

  const next = lines.findIndex((line, index) => index > heading && /^##? /.test(line));
  const end = next === -1 ? lines.length : next;
  const body = trimBlank(lines.slice(heading + 1, end));

  lines.splice(heading + 1, end - heading - 1, '', ...body, entry, ...(next === -1 ? [] : ['']));

  return `${lines.join('\n')}\n`;
}

function chosenOption(options, answer) {
  const letter = /^([A-Z])\b/.exec(answer)?.[1];

  if (!letter) return null;

  const match = new RegExp(`\\*\\*${letter}\\.\\*\\*\\s*(.*?)(?=\\s*\\*\\*[A-Z]\\.\\*\\*|$)`).exec(
    options,
  );

  return match ? `${letter}: ${match[1].replace(/\.$/, '')}` : null;
}

export function rulingLine({ id, ticket, card, answer, date, source }) {
  const quote = answer.split('\n').join(' / ');
  const chosen = chosenOption(card.options, answer);
  const rule = `${ticket} ${card.id} ${card.title}${chosen ? ` ${chosen}` : ''}`.replace(/\.$/, '');
  const end = /[?!]$/.test(rule) ? '' : '.';

  return `- DR-${String(id).padStart(3, '0')} "${quote}" (${date}) → ${rule}${end} [source](${source})`;
}

export function nextRulingId(...texts) {
  const ids = texts.flatMap((text) => [...(text ?? '').matchAll(RULING_ID)].map(([, n]) => +n));

  return Math.max(0, ...ids) + 1;
}

export function addRuling(text, topic, row) {
  const lines = (text ?? '').replace(/\n+$/, '').split('\n');
  const heading = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${topic}`.toLowerCase(),
  );

  if (heading === -1) {
    return `${lines.join('\n')}${lines.join('') === '' ? '' : '\n\n'}## ${topic}\n\n${row}\n`;
  }

  const next = lines.findIndex((line, index) => index > heading && /^## /.test(line));
  let at = next === -1 ? lines.length : next;

  while (at > heading + 1 && lines[at - 1].trim() === '') at--;

  lines.splice(at, 0, row);

  return `${lines.join('\n')}\n`;
}

function relative(folder, file) {
  return `tickets/${folder}/${file}`;
}

export function renderOpen({ specs, batches }) {
  const out = [
    '# Open decisions',
    '',
    'Write after `Answer:`, `Approve:` (`yes` approves the spec; any other text goes to its Owner notes) and `Go:` (`yes`), then run `pnpm ticket decisions` again.',
  ];

  if (specs.length === 0 && batches.length === 0) return `${out.join('\n')}\n\nNone open.\n`;

  for (const spec of specs) {
    out.push('', `## ${spec.ticket} — ${spec.title}`, '');
    out.push(`Spec: [step2_spec.md](${relative(spec.folder, 'step2_spec.md')})`);

    for (const card of spec.cards) {
      out.push('', ...card.lines);

      if (card.answerLine === null) out.push('- **Answer:**');
    }

    if (spec.following.length > 0) out.push('', '### Following Payload', '', ...spec.following);

    out.push('', '### Approve', '', `Approve:${spec.approve ? ` ${spec.approve}` : ''}`);
  }

  for (const batch of batches) {
    out.push('', `## Batch ${batch.batch} plans`, '');

    for (const plan of batch.plans) {
      out.push(`- ${plan.ticket}: [step3_plan.md](${relative(plan.folder, 'step3_plan.md')})`);
    }

    out.push('', `Go:${batch.go ? ` ${batch.go}` : ''}`);
  }

  return `${out.join('\n')}\n`;
}

function titleOf(text, ticket) {
  const heading = /^# (.*)$/m.exec(text)?.[1] ?? '';

  return heading.replace(new RegExp(`^Ticket ${ticket}\\s*—\\s*`), '').trim() || `Ticket ${ticket}`;
}

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

export function recordDecisions(processDir, tickets, date) {
  const files = new Map();
  const messages = [];
  const problems = [];
  const openPath = path.join(processDir, OPEN);
  const open = parseOpen(read(openPath) ?? '');
  const specPath = (ticket) => path.join(processDir, relative(ticket.folder, 'step2_spec.md'));
  const planPath = (ticket) => path.join(processDir, relative(ticket.folder, 'step3_plan.md'));
  const current = (file, fallback) => (files.has(file) ? files.get(file) : fallback);
  const byNumber = new Map(tickets.map((ticket) => [ticket.ticket, ticket]));
  const pendingApprove = new Map();
  const pendingGo = new Map();
  let rulings = read(path.join(processDir, RULINGS));
  let nextId = nextRulingId(rulings, read(path.join(processDir, ARCHIVED_RULINGS)));

  for (const [number, entry] of open.specs) {
    const ticket = byNumber.get(number);
    const hasText = entry.cards.size > 0 || entry.approve;

    if (!ticket?.spec || !isDraft(ticket.spec)) {
      if (hasText) problems.push(`${OPEN}: ${number} has answers but its spec is not a Draft`);
      continue;
    }

    let spec = ticket.spec;

    for (const [id, answer] of entry.cards) {
      const card = parseCards(spec).find((candidate) => candidate.id === id);

      if (!card) {
        problems.push(`${OPEN}: ${number} ${id} is not a card in step2_spec.md`);
        continue;
      }

      if (card.answer) {
        if (card.answer !== answer) {
          problems.push(`${OPEN}: ${number} ${id} is already answered differently in the spec`);
        }

        continue;
      }

      spec = writeAnswer(spec, card, answer);
      messages.push(`${number} ${id}: answer recorded`);

      if (card.topic) {
        const written = parseCards(spec).find((candidate) => candidate.id === id);
        const source = `${relative(ticket.folder, 'step2_spec.md')}#L${written.answerLine + 1}`;
        const row = rulingLine({ id: nextId, ticket: number, card, answer, date, source });

        rulings = addRuling(rulings, card.topic, row);
        messages.push(`DR-${String(nextId).padStart(3, '0')} added under ${card.topic}`);
        nextId++;
      }
    }

    if (YES.test(entry.approve)) {
      const unanswered = parseCards(spec).filter((card) => !card.answer);

      if (unanswered.length === 0) {
        spec = setStatus(spec, `Approved (${date})`);
        messages.push(`${number}: Approved (${date})`);
      } else {
        pendingApprove.set(number, entry.approve);

        messages.push(
          `${number}: Approve waits for ${unanswered.map((card) => card.id).join(', ')}`,
        );
      }
    } else if (entry.approve) {
      spec = addOwnerNote(spec, date, entry.approve);
      messages.push(`${number}: Approve text added to Owner notes`);
    }

    if (spec !== ticket.spec) files.set(specPath(ticket), spec);
  }

  const batchesOf = new Map();

  for (const ticket of tickets) {
    const batch = ticket.header?.batch;

    if (typeof batch !== 'number') continue;

    batchesOf.set(String(batch), [...(batchesOf.get(String(batch)) ?? []), ticket]);
  }

  const goable = (members) =>
    members.every((ticket) => ticket.plan != null) &&
    members.some((ticket) => !/^Go \(.+\)$/.test(statusOf(current(planPath(ticket), ticket.plan))));

  for (const [batch, entry] of open.batches) {
    const members = batchesOf.get(batch) ?? [];

    if (!entry.go) continue;

    if (members.length === 0 || !goable(members)) {
      problems.push(`${OPEN}: batch ${batch} has a Go: but is not waiting for one`);
      continue;
    }

    if (!YES.test(entry.go)) {
      pendingGo.set(batch, entry.go);
      messages.push(`batch ${batch}: Go: "${entry.go}" is not yes; left in ${OPEN}`);
      continue;
    }

    for (const ticket of members) {
      if (/^Go \(.+\)$/.test(statusOf(ticket.plan))) continue;

      files.set(planPath(ticket), setStatus(ticket.plan, `Go (${date})`));
    }

    messages.push(`batch ${batch}: Go (${date})`);
  }

  if (problems.length > 0) return { messages: [], problems };

  if (rulings !== read(path.join(processDir, RULINGS))) {
    files.set(path.join(processDir, RULINGS), rulings);
  }

  const specs = tickets
    .filter((ticket) => ticket.spec != null && isDraft(current(specPath(ticket), ticket.spec)))
    .sort((a, b) => a.ticket - b.ticket)
    .map((ticket) => {
      const text = current(specPath(ticket), ticket.spec);

      return {
        ticket: ticket.ticket,
        folder: ticket.folder,
        title: titleOf(text, ticket.ticket),
        cards: parseCards(text).filter((card) => !card.answer),
        following: section(text.split('\n'), '## Following Payload'),
        approve: pendingApprove.get(ticket.ticket) ?? '',
      };
    });

  const batches = [...batchesOf]
    .filter(([, members]) => goable(members))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([batch, members]) => ({
      batch,
      plans: [...members].sort((a, b) => a.ticket - b.ticket),
      go: pendingGo.get(batch) ?? '',
    }));

  const rendered = renderOpen({ specs, batches });

  if (rendered !== read(openPath)) files.set(openPath, rendered);

  for (const [file, text] of files) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }

  const cards = specs.reduce((sum, spec) => sum + spec.cards.length, 0);

  messages.push(
    files.size === 0
      ? `${OPEN}: no changes`
      : `${OPEN}: ${cards} cards, ${specs.length} specs, ${batches.length} batches waiting`,
  );

  return { messages, problems };
}
