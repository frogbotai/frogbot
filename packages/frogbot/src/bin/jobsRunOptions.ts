import { CronPattern } from 'croner';

export type JobsRunOptions = {
  cron: string;
  limit: number;
  queue?: string;
  allQueues: boolean;
  handleSchedules: boolean;
  help: boolean;
};

export const jobsRunUsage = `FrogBot usage: frogbot jobs:run [options]

options:
  --cron <expression>   tick schedule (default: "* * * * *", every minute)
  --limit <number>      nonnegative integer batch size (default: 10; 0 runs no jobs)
  --queue <name>        queue to process and schedule (default: default)
  --all-queues         process and schedule all queues; excludes --queue
  --handle-schedules   enqueue scheduled jobs before running each batch (default: off)
  --help, -h           show this help

The first tick runs at the next cron match, in the process's local timezone.
Overlapping ticks are skipped. Tick failures drain and exit 1.
SIGINT/SIGTERM stop new work, drain the active batch and heartbeat, then exit 0.
Scheduler-only: frogbot jobs:run --handle-schedules --all-queues --limit 0`;

export function parseJobsRunOptions(args: string[]): JobsRunOptions {
  const options: JobsRunOptions = {
    cron: '* * * * *',
    limit: 10,
    queue: 'default',
    allQueues: false,
    handleSchedules: false,
    help: false,
  };

  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const separator = arg.indexOf('=');
    const flag = separator < 0 ? arg : arg.slice(0, separator);
    const name = flag === '-h' ? '--help' : flag;

    if (seen.has(name)) throw new Error(`Duplicate option: ${name}`);

    seen.add(name);

    if (['--help', '--all-queues', '--handle-schedules'].includes(name)) {
      if (separator >= 0) throw new Error(`${name} does not accept a value.`);

      if (name === '--help') options.help = true;

      if (name === '--all-queues') options.allQueues = true;

      if (name === '--handle-schedules') options.handleSchedules = true;

      continue;
    }

    if (!['--cron', '--limit', '--queue'].includes(name)) {
      throw new Error(`Unknown option: ${arg}`);
    }

    const value = separator < 0 ? args[++i] : arg.slice(separator + 1);

    if (!value?.trim() || value.startsWith('--')) {
      throw new Error(`${name} requires a value.`);
    }

    if (name === '--cron') options.cron = value;

    if (name === '--queue') options.queue = value;

    if (name === '--limit') {
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error('--limit must be a nonnegative safe integer.');
      }

      options.limit = Number(value);
    }
  }

  if (options.allQueues && seen.has('--queue')) {
    throw new Error('--queue and --all-queues are mutually exclusive.');
  }

  if (options.allQueues) delete options.queue;

  try {
    new CronPattern(options.cron);
  } catch (cause) {
    throw new Error(`Invalid --cron expression: ${options.cron}`, { cause });
  }

  return options;
}
