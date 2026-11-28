import type { Problem } from 'frogbot';

/** A refused submission's code and the answers its `Problem` names, as `{ field, message, code? }`. */
export function refusal(body: unknown) {
  const problem = body as Problem;

  return {
    code: problem.code,
    errors: problem.errors.flatMap(
      (entry) =>
        entry.data?.errors?.map(({ code, path, message }) => ({
          ...(path ? { field: path } : {}),
          message,
          ...(code ? { code } : {}),
        })) ?? [],
    ),
  };
}
