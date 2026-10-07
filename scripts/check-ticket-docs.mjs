#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseHeader } from './ticket.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = 'Usage: pnpm check ticket-docs [<ticket number or folder>...]';

const PROCESS = '_process';

const TICKETS = path.join(PROCESS, 'tickets');

const ARCHIVED_TICKETS = path.join(PROCESS, 'archive', 'tickets');

const RULINGS = path.join(PROCESS, 'decisions.md');

const FOUND = path.join(PROCESS, 'found.md');

const DOCS = {
  research: 'step1_research.md',
  spec: 'step2_spec.md',
  plan: 'step3_plan.md',
};

const STATUS = {
  research: { pattern: /^(?:Draft|Done \(.+\))$/, expected: 'Draft or Done (<date>)' },
  spec: { pattern: /^(?:Draft|Approved \(.+\))$/, expected: 'Draft or Approved (<date>)' },
  plan: { pattern: /^(?:Draft|Go \(.+\))$/, expected: 'Draft or Go (<date>)' },
};

const BANNED = ['migration guide', 'legacy path', 'backward compat', 'deprecat', 'release note'];

const CARD_FIELDS = [
  'Situation',
  'Example',
  'Payload does',
  'Options',
  'Recommendation',
  'Applies to',
  'Reply',
  'Answer',
];

const FOUND_KINDS = ['bug', 'pre-existing failure', 'test gap', 'docs', 'idea'];

const SUMMARY_LINES = 40;

const WORDS = { spec: 1500, plan: 2000 };

const MAX_RULINGS = 60;

const MAX_STAGES = 3;

const SYMBOL_WINDOW = 3;

const QUOTE_LENGTH = 60;

const FOLDER = /^ticket(\d+)_.+$/;

const FENCE = /^\s*(`{3,}|~{3,})/;

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

const CODE_SPAN = /`([^`\n]+)`/g;

const CITATION = /^(?:~\/code\/([^/\s]+)\/)?([^\s:`]+):(\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*)$/;

const SYMBOL = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?$/;

const FILE_NAME = /\.(?:[cm]?[jt]sx?|json[c5]?|mdx?|ya?ml|css|html|tsv|csv|txt|py|sh|toml)$/;

const DECISION_ROW = /^- (DR-\d{3}) (?:"|\(summary\b).* → .+ \[source\]\([^)\s]+\)$/;

const FOUND_ROW = new RegExp(
  `^- (F-\\d{3}) (?:${FOUND_KINDS.join('|')})(?: \\([^)]*\\))? · [^·]+ · .+\\[source\\]\\([^)\\s]+\\)`,
);

const TABLE_HEADER = /^\|\s*#\s*\|\s*Title\s*\|\s*PLAN\s*\|\s*Depends on\s*\|/i;

function quote(text) {
  return text.length > QUOTE_LENGTH ? `"${text.slice(0, QUOTE_LENGTH - 1)}…"` : `"${text}"`;
}

function count(number) {
  return number.toLocaleString('en-US');
}

function readOptional(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function isFile(file) {
  return existsSync(file) && statSync(file).isFile();
}

function parseDoc(text) {
  const lines = text.split(/\r?\n/);
  let fence = null;

  const prose = lines.map((line) => {
    const marker = FENCE.exec(line)?.[1];

    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;

      return false;
    }

    if (marker) fence = marker;

    return !marker;
  });

  const headings = lines.flatMap((line, index) => {
    const match = prose[index] && HEADING.exec(line);

    return match ? [{ level: match[1].length, title: match[2], index }] : [];
  });

  return { lines, prose, headings };
}

function section(doc, title) {
  const at = doc.headings.findIndex(
    (heading) => heading.level === 2 && heading.title.toLowerCase() === title.toLowerCase(),
  );

  if (at === -1) return null;

  const next = doc.headings.slice(at + 1).find(({ level }) => level <= 2);
  const previous = doc.headings.slice(0, at).filter(({ level }) => level === 2);

  return {
    index: doc.headings[at].index,
    end: next ? next.index : doc.lines.length,
    previous: previous.at(-1)?.title ?? null,
  };
}

function plain(line) {
  return line
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/, '')
    .trim();
}

function topicName(text) {
  return text
    .replace(/`/g, '')
    .replace(/^#+\s*/, '')
    .replace(/\.$/, '')
    .trim();
}

function parseDecisions(text) {
  const doc = parseDoc(text);
  const topics = new Set();
  const rows = new Map();
  const problems = [];
  let topic = null;

  doc.lines.forEach((line, index) => {
    if (!doc.prose[index]) return;

    const heading = HEADING.exec(line);

    if (heading && heading[1].length === 2) {
      topic = heading[2];
      topics.add(topic);

      return;
    }

    if (!line.startsWith('- ')) return;

    const row = DECISION_ROW.exec(line);

    if (!row) {
      problems.push({
        line: index + 1,
        message:
          'row is not `- DR-nnn "quote" → rule. [source](link)` (or `(summary)` for the quote)',
      });

      return;
    }

    if (!topic) {
      problems.push({ line: index + 1, message: `${row[1]} is not under a topic heading` });
    }

    const seen = rows.get(row[1]);

    if (seen) problems.push({ line: index + 1, message: `${row[1]} is also on line ${seen.line}` });
    else rows.set(row[1], { line: index + 1, text: line });
  });

  if (rows.size > MAX_RULINGS) {
    problems.push({
      line: 1,
      message: `${rows.size} rulings (max ${MAX_RULINGS}); move enforced rows to the archive`,
    });
  }

  return { topics, rows, problems };
}

function parseFound(text) {
  const ids = new Map();
  const problems = [];

  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.startsWith('- ')) return;

    const row = FOUND_ROW.exec(line);

    if (!row) {
      problems.push({
        line: index + 1,
        message: `row is not \`- F-nnn <${FOUND_KINDS.join('|')}> · area · description. [source](link)\``,
      });

      return;
    }

    const seen = ids.get(row[1]);

    if (seen) problems.push({ line: index + 1, message: `${row[1]} is also on line ${seen}` });
    else ids.set(row[1], index + 1);
  });

  return { problems };
}

function parsePlanTable(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  let inTable = false;

  lines.forEach((line, index) => {
    if (TABLE_HEADER.test(line)) {
      inTable = true;

      return;
    }

    if (!inTable) return;

    if (!line.startsWith('|')) {
      inTable = false;

      return;
    }

    const cells = line
      .slice(1, line.trimEnd().endsWith('|') ? line.trimEnd().length - 1 : undefined)
      .split('|')
      .map((cell) => cell.trim());

    if (!/^\d+$/.test(cells[0])) return;

    const [ticket, title, section, depends] = cells;

    rows.push({
      ticket: Number(ticket),
      title,
      section: /^P\d+$/.test(section) ? section : null,
      depends: depends === 'none' ? [] : depends.split(',').map((n) => Number(n.trim())),
      line: index + 1,
    });
  });

  return rows;
}

function resolver({ root, home }) {
  const cache = new Map();

  return (repo, file) => {
    const base = repo ? path.join(home, 'code', repo) : root;

    if (repo && !existsSync(base)) return { missing: `~/code/${repo}` };

    const absolute = path.join(base, file);

    if (!cache.has(absolute)) {
      const text = isFile(absolute) ? readFileSync(absolute, 'utf8') : null;

      cache.set(absolute, text === null ? null : text.replace(/\n$/, '').split(/\r?\n/));
    }

    return { lines: cache.get(absolute) };
  };
}

function symbolName(span) {
  if (!SYMBOL.test(span) || FILE_NAME.test(span)) return null;

  const call = span.endsWith('()');
  const name = span.replace(/\(\)$/, '');

  if (!call && !/[A-Z_$.]/.test(name.slice(1))) return null;

  return name.split('.').at(-1);
}

function checkCitations(doc, { resolve, problem, warn }) {
  const warned = new Set();

  doc.lines.forEach((line, index) => {
    if (!doc.prose[index]) return;

    const matches = [...line.matchAll(CODE_SPAN)];
    const spans = matches.map((match) => match[1].trim());
    const gaps = matches.map((match, at) =>
      at + 1 < matches.length
        ? line.slice(match.index + match[0].length, matches[at + 1].index)
        : '',
    );
    const places = [];
    let last = null;

    for (const [at, span] of spans.entries()) {
      const citation = CITATION.exec(span);
      const followOn = /^:(\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*)$/.exec(span);

      if (!citation && !(followOn && last)) continue;

      const [repo, file, list] = citation ? citation.slice(1) : [...last, followOn[1]];

      if (!file.includes('/') && !/\.[A-Za-z]\w*$/.test(file)) continue;

      const found = resolve(repo, file);

      last = found.lines ? [repo, file] : null;

      if (found.missing) {
        if (!warned.has(found.missing)) {
          warned.add(found.missing);
          warn(
            index + 1,
            `reference repo ${found.missing} is missing; its citations are not checked`,
          );
        }

        continue;
      }

      if (!found.lines) {
        problem(index + 1, `\`${span}\`: no such file`);

        continue;
      }

      const ranges = list.split(',').map((part) => part.trim().split('-').map(Number));
      const past = ranges.flat().find((number) => number < 1 || number > found.lines.length);

      if (past !== undefined) {
        problem(
          index + 1,
          `\`${span}\`: line ${past} is out of range (${found.lines.length} lines)`,
        );

        continue;
      }

      places[at] = { lines: found.lines, ranges };
    }

    for (const [at, span] of spans.entries()) {
      const name = symbolName(span);
      const place = /^\s*(?:\(|at)?\s*$/.test(gaps[at]) && places[at + 1];

      if (!name || !place) continue;

      const near = place.ranges.some(([from, to = from]) =>
        place.lines
          .slice(Math.max(0, from - 1 - SYMBOL_WINDOW), to + SYMBOL_WINDOW)
          .some((cited) => cited.includes(name)),
      );

      if (!near) {
        problem(
          index + 1,
          `\`${span}\` is not within ${SYMBOL_WINDOW} lines of \`${spans[at + 1]}\``,
        );
      }
    }
  });
}

function checkStatus(doc, kind, problem) {
  const index = doc.lines.findIndex((line, at) => doc.prose[at] && /^Status:/.test(line));
  const { pattern, expected } = STATUS[kind];

  if (index === -1) {
    problem(1, `missing "Status: ${expected}"`);

    return;
  }

  const value = doc.lines[index].slice('Status:'.length).trim();

  if (!pattern.test(value)) problem(index + 1, `Status: ${quote(value)} is not ${expected}`);
}

function checkRulings(doc, { start, end, at, prefixed }, { decisions, problem }) {
  const ids = new Set();
  let listed = false;

  for (let index = start; index < end; index++) {
    if (!doc.prose[index]) continue;

    const line = doc.lines[index];
    const row = /^\s*- (DR-\d+)\b/.exec(line);

    if (row) {
      const known = decisions.rows.get(row[1]);

      listed = true;
      ids.add(row[1]);

      if (!known) problem(index + 1, `${row[1]} is not in decisions.md`);
      else if (line.trim() !== known.text) {
        problem(index + 1, `${row[1]} differs from decisions.md:${known.line}; copy the row whole`);
      }

      continue;
    }

    const text = plain(line);
    const none = prefixed
      ? /^Rulings:\s*(none\b.*)$/i.exec(text)
      : /^(?:Rulings:\s*)?(none\b.*)$/i.exec(text);

    if (!none) continue;

    listed = true;

    const read = /^none \(read: ([^)]+)\)/i.exec(none[1]);

    if (!read) {
      problem(
        index + 1,
        'bare "none": write "none (read: <topic>, …)" with the decisions.md headings read',
      );

      continue;
    }

    for (const topic of read[1].split(',').map(topicName)) {
      if (!decisions.topics.has(topic)) {
        problem(index + 1, `"${topic}" is not a decisions.md heading`);
      }
    }
  }

  if (!listed) {
    problem(
      at,
      'no rulings: copy each applying decisions.md row whole, or write "Rulings: none (read: <topic>, …)"',
    );
  }

  return ids;
}

function checkResearch(doc, context) {
  const { problem } = context;
  const summary = section(doc, 'Summary');

  checkStatus(doc, 'research', problem);

  if (!summary) {
    problem(1, 'missing "## Summary"');

    return null;
  }

  const lines = doc.lines
    .slice(summary.index + 1, summary.end)
    .filter((line) => line.trim() !== '').length;

  if (lines > SUMMARY_LINES) {
    problem(summary.index + 1, `Summary is ${lines} lines (max ${SUMMARY_LINES})`);
  }

  return checkRulings(
    doc,
    { start: summary.index + 1, end: summary.end, at: summary.index + 1, prefixed: true },
    context,
  );
}

function checkBanned(doc, problem) {
  const outOfScope = section(doc, 'Out of scope');

  doc.lines.forEach((line, index) => {
    if (outOfScope && index > outOfScope.index && index < outOfScope.end) return;

    if (/^\s*>/.test(line)) return;

    const lower = line.toLowerCase();

    for (const phrase of BANNED) {
      if (lower.includes(phrase)) {
        problem(
          index + 1,
          `banned phrase "${phrase}" (allowed only under Out of scope or in a > quote)`,
        );
      }
    }
  });
}

function checkWords(doc, kind, problem) {
  const words = doc.lines.join('\n').split(/\s+/).filter(Boolean).length;

  if (words > WORDS[kind]) {
    problem(1, `${kind} is ${count(words)} words (max ${count(WORDS[kind])})`);
  }
}

function checkCards(doc, { decisions, problem }) {
  doc.headings.forEach((heading, at) => {
    const id = heading.level === 3 && /\bD\d+\b/.exec(heading.title)?.[0];

    if (!id) return;

    const end =
      doc.headings.slice(at + 1).find(({ level }) => level <= 3)?.index ?? doc.lines.length;

    const fields = new Map();

    for (let index = heading.index + 1; index < end; index++) {
      if (!doc.prose[index]) continue;

      const field = new RegExp(`^(${CARD_FIELDS.join('|')})\\s*[.:]\\s*(.*)$`).exec(
        plain(doc.lines[index]),
      );

      if (field && !fields.has(field[1])) fields.set(field[1], { index, value: field[2] });
    }

    const missing = CARD_FIELDS.filter((name) => !fields.has(name));

    if (missing.length > 0) {
      problem(
        heading.index + 1,
        `card ${id}: missing ${missing.map((name) => `"${name}"`).join(', ')}`,
      );
    }

    const payload = fields.get('Payload does');

    if (
      payload &&
      !/`[^`\s]+:\d+/.test(payload.value) &&
      !/no equivalent \(searched/i.test(payload.value)
    ) {
      problem(
        payload.index + 1,
        `card ${id}: "Payload does:" needs a \`path:line\` or "no equivalent (searched …)"`,
      );
    }

    const applies = fields.get('Applies to');
    const target = applies && topicName(applies.value);

    if (applies && target !== 'this ticket' && !decisions.topics.has(target)) {
      problem(
        applies.index + 1,
        `card ${id}: "Applies to:" is ${quote(target)}, not "this ticket" or a decisions.md heading`,
      );
    }
  });
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function checkSpec(doc, context, researchIds) {
  const { problem } = context;
  const rulings = section(doc, 'Rulings');

  checkStatus(doc, 'spec', problem);
  checkCards(doc, context);
  checkBanned(doc, problem);
  checkWords(doc, 'spec', problem);

  if (!rulings) {
    problem(1, 'missing "## Rulings" (right after "## Problem")');

    return;
  }

  if (rulings.previous !== 'Problem') {
    problem(rulings.index + 1, '"## Rulings" must come right after "## Problem"');
  }

  const ids = checkRulings(
    doc,
    { start: rulings.index + 1, end: rulings.end, at: rulings.index + 1, prefixed: false },
    context,
  );

  if (researchIds && !sameSet(ids, researchIds)) {
    const extra = [...ids].filter((id) => !researchIds.has(id));
    const missing = [...researchIds].filter((id) => !ids.has(id));
    const parts = [
      extra.length > 0 && `not in the research: ${extra.join(', ')}`,
      missing.length > 0 && `missing from the research: ${missing.join(', ')}`,
    ].filter(Boolean);

    problem(rulings.index + 1, `rulings differ from the research Summary (${parts.join('; ')})`);
  }
}

function checkTouches(doc, problem) {
  const index = doc.lines.findIndex((line, at) => doc.prose[at] && /^touches:/.test(line));

  if (index === -1) {
    problem(1, 'missing "touches:"');

    return;
  }

  const first = doc.lines.findIndex(
    (line, at) =>
      doc.prose[at] && line.trim() !== '' && !/^#\s/.test(line) && !/^Status:/.test(line),
  );

  if (first !== index) problem(index + 1, '"touches:" must come first, right after Status:');
}

function checkStages(doc, problem) {
  const stages = section(doc, 'Stages');

  if (!stages) {
    problem(1, 'missing "## Stages"');

    return;
  }

  const range = doc.lines.map((line, index) => index).slice(stages.index + 1, stages.end);
  const headed = range.some((index) => doc.headings.some((heading) => heading.index === index));
  const starts = range.filter(
    (index) =>
      doc.prose[index] &&
      (headed ? /^###\s/.test(doc.lines[index]) : /^\d+\.\s/.test(doc.lines[index])),
  );

  if (starts.length === 0) problem(stages.index + 1, '"## Stages" lists no stages');

  if (starts.length > MAX_STAGES) {
    problem(
      starts[MAX_STAGES] + 1,
      `${starts.length} stages (max ${MAX_STAGES}); split the ticket`,
    );
  }

  starts.forEach((start, at) => {
    const text = doc.lines.slice(start, starts[at + 1] ?? stages.end).join('\n');
    const missing = ['Verify', 'Evidence'].filter(
      (label) => !new RegExp(`\\b${label}:`).test(text),
    );

    if (missing.length > 0) {
      problem(
        start + 1,
        `stage ${at + 1}: missing ${missing.map((label) => `"${label}:"`).join(' and ')}`,
      );
    }
  });
}

function checkPlan(doc, { problem }) {
  checkStatus(doc, 'plan', problem);
  checkTouches(doc, problem);
  checkStages(doc, problem);
  checkBanned(doc, problem);
  checkWords(doc, 'plan', problem);
}

function checkIssue({ text, ticket, row, planFile }, problem) {
  if (text === null) {
    problem(1, 'missing issue.md');

    return;
  }

  const header = parseHeader(text);

  if (!header) {
    problem(1, 'missing the "Plan: … · Depends on: … · Batch: …" header line');

    return;
  }

  for (const message of header.problems) problem(header.line, message);

  const lines = text.split(/\r?\n/);
  const title = /^# Ticket (\d+) — (.+)$/.exec(lines[0]);

  if (!title || Number(title[1]) !== ticket) {
    problem(1, `title is not "# Ticket ${ticket} — <title>"`);
  }

  if (!row) return;

  if (title && title[2] !== row.title) {
    problem(1, `title ${quote(title[2])} is ${quote(row.title)} in ${planFile}:${row.line}`);
  }

  const section = /\[PLAN\.md (P\d+)\]/.exec(lines[header.line - 1])?.[1] ?? null;

  if (section !== row.section) {
    problem(
      header.line,
      `Plan: ${section ?? 'none'}, but ${planFile}:${row.line} says ${row.section}`,
    );
  }

  const depends = (list) =>
    list.length === 0 ? 'none' : [...list].sort((a, b) => a - b).join(', ');

  if (header.problems.length === 0 && depends(header.depends) !== depends(row.depends)) {
    problem(
      header.line,
      `Depends on: ${depends(header.depends)}, but ${planFile}:${row.line} says ${depends(row.depends)}`,
    );
  }
}

function ticketFolders(dir) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && FOLDER.test(entry.name))
    .map((entry) => ({ name: entry.name, ticket: Number(FOLDER.exec(entry.name)[1]) }));
}

function planFiles(idea) {
  const dir = path.join(idea, 'audits');

  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isFile(path.join(dir, entry.name, 'PLAN.md')))
    .map((entry) => path.join('audits', entry.name, 'PLAN.md'))
    .sort();
}

function checkTicketDocs({ idea, root, home = os.homedir(), only = [] }) {
  const problems = [];
  const warnings = [];
  const at = (list, file) => (line, message) => list.push({ file, line, message });
  const resolve = resolver({ root, home });
  const decisionsText = readOptional(path.join(idea, RULINGS));
  const decisions = parseDecisions(decisionsText ?? '');
  const folders = ticketFolders(path.join(idea, TICKETS));
  const archived = new Set(
    ticketFolders(path.join(idea, ARCHIVED_TICKETS)).map(({ ticket }) => ticket),
  );
  const filtered = only.length > 0;
  const rows = new Map();

  for (const planFile of planFiles(idea)) {
    for (const row of parsePlanTable(readFileSync(path.join(idea, planFile), 'utf8'))) {
      rows.set(row.ticket, { ...row, planFile });
    }
  }

  if (decisionsText === null) problems.push({ file: RULINGS, line: 1, message: 'missing' });
  else if (!filtered) {
    for (const { line, message } of decisions.problems) {
      problems.push({ file: RULINGS, line, message });
    }
  }

  const foundText = readOptional(path.join(idea, FOUND));

  if (!filtered && foundText !== null) {
    for (const { line, message } of parseFound(foundText).problems) {
      problems.push({ file: FOUND, line, message });
    }
  }

  const wanted = (ticket) => !filtered || only.includes(ticket);
  const checked = [];

  for (const row of rows.values()) {
    if (!wanted(row.ticket)) continue;

    const matches = folders.filter(({ ticket }) => ticket === row.ticket);

    if (!row.section) {
      for (const { name } of matches) {
        problems.push({
          file: row.planFile,
          line: row.line,
          message: `ticket ${row.ticket} is cut or merged but has a folder: ${TICKETS}/${name}`,
        });
      }
    } else if (matches.length === 0 && !archived.has(row.ticket)) {
      problems.push({
        file: row.planFile,
        line: row.line,
        message: `ticket ${row.ticket} has no folder in ${TICKETS}/`,
      });
    }
  }

  for (const folder of folders) {
    const row = rows.get(folder.ticket);
    const dir = path.join(idea, TICKETS, folder.name);
    const docs = Object.fromEntries(
      Object.entries(DOCS).map(([kind, name]) => [kind, readOptional(path.join(dir, name))]),
    );

    const current = Object.values(docs).some((text) => text !== null);

    if (!wanted(folder.ticket) || !(current || row?.section)) continue;

    checked.push(folder.ticket);

    const file = (name) => path.join(TICKETS, folder.name, name);

    checkIssue(
      {
        text: readOptional(path.join(dir, 'issue.md')),
        ticket: folder.ticket,
        row: row?.section ? row : null,
        planFile: row?.planFile,
      },
      at(problems, file('issue.md')),
    );

    const context = (name) => ({
      decisions,
      resolve,
      problem: at(problems, file(name)),
      warn: at(warnings, file(name)),
    });

    let researchIds = null;

    for (const [kind, text] of Object.entries(docs)) {
      if (text === null) continue;

      const doc = parseDoc(text);
      const docContext = context(DOCS[kind]);

      if (kind === 'research') researchIds = checkResearch(doc, docContext);

      if (kind === 'spec') checkSpec(doc, docContext, researchIds);

      if (kind === 'plan') checkPlan(doc, docContext);

      checkCitations(doc, docContext);
    }
  }

  return { problems, warnings, tickets: checked.length };
}

function format({ file, line, message }, prefix = '') {
  return `${path.join('.idea', file)}:${line} ${prefix}${message}`;
}

function parseTickets(argv) {
  const tickets = [];

  for (const arg of argv) {
    const match = /^(?:.*\/)?(?:ticket)?(\d+)(?:_[^/]*)?\/?$/.exec(arg);

    if (!match) return { error: `"${arg}" is not a ticket number or folder` };

    tickets.push(Number(match[1]));
  }

  return { tickets };
}

export function run({ idea, root, home, argv = [] }) {
  if (!existsSync(path.join(idea, TICKETS))) {
    return {
      code: 0,
      lines: [`ticket-docs: skipped, no .idea/${TICKETS}/ here (run it in the main checkout)`],
    };
  }

  const options = parseTickets(argv);

  if (options.error) return { code: 2, lines: [`ticket-docs: ${options.error}. ${USAGE}`] };

  const { problems, warnings, tickets } = checkTicketDocs({
    idea,
    root,
    home,
    only: options.tickets,
  });

  const byPlace = (a, b) => a.file.localeCompare(b.file) || a.line - b.line;

  const lines = [
    ...problems.sort(byPlace).map((problem) => format(problem)),
    ...warnings.sort(byPlace).map((warning) => format(warning, 'warning: ')),
  ];

  if (problems.length === 0) {
    const noun = tickets === 1 ? 'ticket' : 'tickets';

    lines.push(`ticket-docs: OK · ${tickets} ${noun}`);
  }

  return { code: problems.length > 0 ? 1 : 0, lines };
}

function main() {
  const result = run({ idea: path.join(ROOT, '.idea'), root: ROOT, argv: process.argv.slice(2) });

  console.log(result.lines.join('\n'));
  process.exitCode = result.code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
