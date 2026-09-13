import type { Jobs } from 'frogbot';
import type { Payload, PayloadRequest } from 'payload';
import { expectTypeOf } from 'vitest';

type NativeJobs = Payload['jobs'];

type Operation = Exclude<keyof NativeJobs, 'queue'>;

type NativeArgs<K extends Operation> = NonNullable<Parameters<NativeJobs[K]>[0]>;

type PublicArgs<K extends Operation> = NonNullable<Parameters<Jobs[K]>[0]>;

type SignatureParity = {
  [K in Operation]: {
    args: Omit<PublicArgs<K>, 'req'>;
    required: [] extends Parameters<Jobs[K]> ? false : true;
    result: ReturnType<Jobs[K]>;
  };
};

type NativeSignatureParity = {
  [K in Operation]: {
    args: Omit<NativeArgs<K>, 'req'>;
    required: [] extends Parameters<NativeJobs[K]> ? false : true;
    result: ReturnType<NativeJobs[K]>;
  };
};

expectTypeOf<SignatureParity>().toEqualTypeOf<NativeSignatureParity>();
expectTypeOf<Exclude<keyof Jobs, 'resume'>>().toEqualTypeOf<keyof NativeJobs>();

expectTypeOf<
  Omit<Parameters<Jobs['queue']>[0], 'input' | 'task' | 'workflow' | 'req' | 'jobId'>
>().toEqualTypeOf<
  Omit<Parameters<NativeJobs['queue']>[0], 'input' | 'task' | 'workflow' | 'req'>
>();

export async function nativeRequests(jobs: Jobs, req: PayloadRequest) {
  const job = await jobs.queue({ task: 'send-notification', input: { recipient: 'owner' }, req });

  await jobs.run({ req });
  await jobs.runByID({ id: job.id, req });
  await jobs.handleSchedules({ req });
  await jobs.cancel({ where: {}, req });
  await jobs.cancelByID({ id: job.id, req });
}
