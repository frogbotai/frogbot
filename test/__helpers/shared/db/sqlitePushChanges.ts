const partialIndexes = ['payload_jobs_job_id_live_idx'];

export function sqlitePushChanges(statements: string[]): string[] {
  return statements.filter(
    (statement) => !partialIndexes.some((index) => statement.includes(`\`${index}\``)),
  );
}
