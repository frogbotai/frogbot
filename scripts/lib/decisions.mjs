import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const RULINGS = 'decisions.md';

const ARCHIVED_RULINGS = path.join('archive', 'decisions.md');

const PARKED = 'parked.md';

const PARKED_ROW = /^\|\s*\[(\d+)\]/gm;

const CARD = /^### (?:(\d+) )?(D\d+)\b\s*(?:—\s*)?(.*)$/;

const ANSWER = /^(\s*(?:-\s*)?)(?:\*\*Answer:\*\*|Answer:)(.*)$/;

const APPLIES = /^\s*-?\s*\*\*Applies to:\*\*\s*(.*)$/;

const OPTIONS = /^\s*-?\s*\*\*Options\.\*\*\s*(.*)$/;

const STATUS = /^Status:\s*(.*)$/m;

const RULING_ID = /^- DR-(\d+)\b/gm;

const THIS_TICKET = /^this ticket\.?$/i;

const REPLIES = [
  ['answer', /^(\d+) ([Dd]\d+):\s*(.*)$/],
  ['approve', /^(\d+) approve$/i],
  ['note', /^(\d+) note:\s*(.*)$/i],
  ['go', /^go (\d+)$/i],
];

export const REPLY_USAGE =
  "pnpm ticket decisions <<'EOF' with one reply per line: `<n> D<k>: <owner's words>` (indent any further lines), `<n> note: <owner's words>`, `<n> approve`, `go <batch>`";

function statusOf(text) {
  return STATUS.exec(text ?? '')?.[1].trim() ?? '';
}

function setStatus(text, status) {
  return text.replace(STATUS, `Status: ${status}`);
}

function isDraft(text) {
  return /^Draft\b/.test(statusOf(text));
}

function isGo(text) {
  return /^Go \(.+\)$/.test(statusOf(text));
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
    if (line.startsWith('#')) break;

    rest.push(line.trim());
  }

  return trimBlank([first.trim(), ...rest])
    .join('\n')
    .trim();
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

/** Reads the coordinator's stdin: the owner's chat replies, one per line, in their own words. */
export function parseReplies(text) {
  const replies = [];
  const problems = [];

  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trimEnd();
    const found = REPLIES.map(([kind, pattern]) => [kind, pattern.exec(line)]).find(([, m]) => m);

    if (found) {
      const [kind, match] = found;

      if (kind === 'go') replies.push({ kind, batch: match[1] });
      else if (kind === 'approve') replies.push({ kind, ticket: Number(match[1]) });
      else if (kind === 'note') replies.push({ kind, ticket: Number(match[1]), lines: [match[2]] });
      else {
        replies.push({
          kind,
          ticket: Number(match[1]),
          id: match[2].toUpperCase(),
          lines: [match[3]],
        });
      }
    } else if (replies.at(-1)?.lines && (line === '' || /^\s/.test(line))) {
      replies.at(-1).lines.push(line.trim());
    } else if (line.trim() !== '') {
      problems.push(`line ${index + 1} is not a reply: "${line.trim()}"`);
    }
  }

  for (const reply of replies) {
    if (!reply.lines) continue;

    reply.text = trimBlank(reply.lines).join('\n').trim();
    delete reply.lines;

    if (reply.text === '') {
      problems.push(`${reply.ticket} ${reply.id ?? 'note'}: no text; write the owner's words`);
    }
  }

  return { replies, problems };
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

function titleOf(text, ticket) {
  const heading = /^# (.*)$/m.exec(text)?.[1] ?? '';

  return heading.replace(new RegExp(`^Ticket ${ticket}\\s*—\\s*`), '').trim() || `Ticket ${ticket}`;
}

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

export function parkedTickets(processDir) {
  return new Set(
    [...(read(path.join(processDir, PARKED)) ?? '').matchAll(PARKED_ROW)].map(([, n]) => +n),
  );
}

/** What still needs the owner, for the coordinator to bring to chat. */
export function renderWaiting({ specs, batches }) {
  if (specs.length === 0 && batches.length === 0) return ['Nothing waiting for the owner.'];

  const out = ['Waiting for the owner (ask in chat, from each spec’s Brief):'];

  for (const spec of specs) {
    out.push(`${spec.ticket} — ${spec.title} (${relative(spec.folder, 'step2_spec.md')})`);

    for (const card of spec.cards) out.push(`  ${card.id} — ${card.title}`);

    out.push('  approve');
  }

  for (const batch of batches) {
    out.push(`batch ${batch.batch}: go (${batch.plans.map((plan) => plan.ticket).join(', ')})`);
  }

  return out;
}

/**
 * Records the owner's chat replies word for word, then lists what still waits.
 * Writes nothing when any reply is refused.
 */
export function recordDecisions(processDir, tickets, date, input = '') {
  const files = new Map();
  const messages = [];
  const { replies, problems } = parseReplies(input);
  const parked = parkedTickets(processDir);
  const specPath = (ticket) => path.join(processDir, relative(ticket.folder, 'step2_spec.md'));
  const planPath = (ticket) => path.join(processDir, relative(ticket.folder, 'step3_plan.md'));
  const specOf = (ticket) => files.get(specPath(ticket)) ?? ticket.spec;
  const planOf = (ticket) => files.get(planPath(ticket)) ?? ticket.plan;
  const byNumber = new Map(tickets.map((ticket) => [ticket.ticket, ticket]));
  const rulingsPath = path.join(processDir, RULINGS);
  let rulings = read(rulingsPath);
  let nextId = nextRulingId(rulings, read(path.join(processDir, ARCHIVED_RULINGS)));

  const draftTicket = (number, label) => {
    const ticket = byNumber.get(number);

    if (!ticket?.spec) problems.push(`${label}: ticket ${number} has no step2_spec.md`);
    else if (parked.has(number)) problems.push(`${label}: ticket ${number} is parked`);
    else return ticket;

    return null;
  };

  const order = { answer: 0, note: 0, approve: 1, go: 2 };

  for (const reply of [...replies].sort((a, b) => order[a.kind] - order[b.kind])) {
    const label =
      reply.kind === 'go' ? `go ${reply.batch}` : `${reply.ticket} ${reply.id ?? reply.kind}`;

    if (reply.kind === 'answer') {
      const ticket = draftTicket(reply.ticket, label);

      if (!ticket) continue;

      let spec = specOf(ticket);
      const card = parseCards(spec).find((candidate) => candidate.id === reply.id);

      if (!card) {
        problems.push(`${label} is not a card in step2_spec.md`);
        continue;
      }

      if (card.answer) {
        if (card.answer !== reply.text) problems.push(`${label} is already answered differently`);

        continue;
      }

      if (!isDraft(spec)) {
        problems.push(`${label}: the spec is not a Draft`);
        continue;
      }

      spec = writeAnswer(spec, card, reply.text);
      files.set(specPath(ticket), spec);
      messages.push(`${label}: answer recorded`);

      if (card.topic) {
        const written = parseCards(spec).find((candidate) => candidate.id === reply.id);
        const source = `${relative(ticket.folder, 'step2_spec.md')}#L${written.answerLine + 1}`;
        const row = rulingLine({
          id: nextId,
          ticket: reply.ticket,
          card,
          answer: reply.text,
          date,
          source,
        });

        rulings = addRuling(rulings, card.topic, row);
        messages.push(`DR-${String(nextId).padStart(3, '0')} added under ${card.topic}`);
        nextId++;
      }
    } else if (reply.kind === 'note') {
      const ticket = draftTicket(reply.ticket, label);

      if (!ticket) continue;

      const spec = addOwnerNote(specOf(ticket), date, reply.text);

      if (spec !== specOf(ticket)) {
        files.set(specPath(ticket), spec);
        messages.push(`${label}: added to Owner notes`);
      }
    } else if (reply.kind === 'approve') {
      const ticket = draftTicket(reply.ticket, label);

      if (!ticket) continue;

      const spec = specOf(ticket);

      if (!isDraft(spec)) continue;

      const unanswered = parseCards(spec).filter((card) => !card.answer);

      if (unanswered.length > 0) {
        problems.push(
          `${label}: ${unanswered.map((card) => card.id).join(', ')} has no answer yet`,
        );

        continue;
      }

      files.set(specPath(ticket), setStatus(spec, `Approved (${date})`));
      messages.push(`${reply.ticket}: Approved (${date})`);
    } else {
      const members = tickets.filter(
        (ticket) => String(ticket.header?.batch) === reply.batch && !parked.has(ticket.ticket),
      );

      if (members.length === 0) {
        problems.push(`${label}: no tickets in batch ${reply.batch}`);
        continue;
      }

      const missing = members.filter((ticket) => ticket.plan == null);

      if (missing.length > 0) {
        problems.push(
          `${label}: no step3_plan.md yet for ${missing.map((t) => t.ticket).join(', ')}`,
        );

        continue;
      }

      const waiting = members.filter((ticket) => !isGo(planOf(ticket)));

      for (const ticket of waiting) {
        files.set(planPath(ticket), setStatus(planOf(ticket), `Go (${date})`));
      }

      if (waiting.length > 0) messages.push(`batch ${reply.batch}: Go (${date})`);
    }
  }

  if (problems.length > 0) return { messages: [], problems };

  if (rulings !== read(rulingsPath)) files.set(rulingsPath, rulings);

  for (const [file, text] of files) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }

  const live = tickets.filter((ticket) => !parked.has(ticket.ticket));

  const specs = live
    .filter((ticket) => ticket.spec != null && isDraft(specOf(ticket)))
    .sort((a, b) => a.ticket - b.ticket)
    .map((ticket) => ({
      ticket: ticket.ticket,
      folder: ticket.folder,
      title: titleOf(specOf(ticket), ticket.ticket),
      cards: parseCards(specOf(ticket)).filter((card) => !card.answer),
    }));

  const batchesOf = new Map();

  for (const ticket of live) {
    const batch = ticket.header?.batch;

    if (typeof batch !== 'number') continue;

    batchesOf.set(String(batch), [...(batchesOf.get(String(batch)) ?? []), ticket]);
  }

  const batches = [...batchesOf]
    .filter(
      ([, members]) =>
        members.every((ticket) => ticket.plan != null) &&
        members.some((ticket) => !isGo(planOf(ticket))),
    )
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([batch, members]) => ({
      batch,
      plans: [...members].sort((a, b) => a.ticket - b.ticket),
    }));

  return { messages: [...messages, ...renderWaiting({ specs, batches })], problems };
}
