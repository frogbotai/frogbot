import { type SQL, sql } from 'drizzle-orm';

const rankConstant = sql.raw('60.0');

export function buildHybridQuery({
  lexical,
  limit,
  vector,
  weights,
}: {
  lexical: SQL;
  limit: number;
  vector: SQL;
  weights: { lexical: number; vector: number };
}): SQL {
  return sql`WITH "lexical" AS (SELECT "id", "score", ROW_NUMBER() OVER (ORDER BY "score" DESC, "id") AS "rank" FROM (${lexical})), "vector" AS (SELECT "id", "score", ROW_NUMBER() OVER (ORDER BY "distance", "id") AS "rank" FROM (${vector})), "ids" AS (SELECT "id" FROM "lexical" UNION SELECT "id" FROM "vector") SELECT "ids"."id" AS "id", COALESCE(${weights.lexical} / (${rankConstant} + "lexical"."rank"), 0) + COALESCE(${weights.vector} / (${rankConstant} + "vector"."rank"), 0) AS "score", "lexical"."rank" AS "lexical_rank", "lexical"."score" AS "lexical_score", "vector"."rank" AS "vector_rank", "vector"."score" AS "vector_score" FROM "ids" LEFT JOIN "lexical" ON "lexical"."id" = "ids"."id" LEFT JOIN "vector" ON "vector"."id" = "ids"."id" ORDER BY "score" DESC, "ids"."id" LIMIT ${limit}`;
}
