const rrfRankConstant = 60;

type Stage = Record<string, unknown>;

type Component = 'lexical' | 'vector';

function buildRankStages({
  component,
  idPath,
  score,
}: {
  component: Component;
  idPath: string;
  score: Stage;
}): Stage[] {
  return [
    { $project: { _id: 0, id: `$${idPath}`, score } },
    { $setWindowFields: { sortBy: { score: -1 }, output: { rank: { $rank: {} } } } },
    { $project: { id: 1, [component]: { rank: '$rank', score: '$score' } } },
  ];
}

function buildReciprocalRank({ component, weight }: { component: Component; weight: number }) {
  return { $ifNull: [{ $divide: [weight, { $add: [rrfRankConstant, `$${component}.rank`] }] }, 0] };
}

function buildScoreDetail(component: Component) {
  return {
    $let: {
      vars: {
        detail: {
          $first: {
            $filter: {
              input: '$details.details',
              cond: { $eq: ['$$this.inputPipelineName', component] },
            },
          },
        },
      },
      in: {
        $cond: [
          { $isNumber: '$$detail.rank' },
          { rank: '$$detail.rank', score: '$$detail.value' },
          null,
        ],
      },
    },
  };
}

export function buildHybridPipeline({
  collection,
  idPath,
  limit,
  rankFusion,
  searchPipeline,
  vectorSearchStage,
  weights,
}: {
  collection: string;
  idPath: string;
  limit: number;
  rankFusion: boolean;
  searchPipeline: Stage[];
  vectorSearchStage: Stage;
  weights: { lexical: number; vector: number };
}): Stage[] {
  if (rankFusion) {
    return [
      {
        $rankFusion: {
          input: { pipelines: { lexical: searchPipeline, vector: [vectorSearchStage] } },
          combination: { weights },
          scoreDetails: true,
        },
      },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          id: `$${idPath}`,
          score: { $meta: 'score' },
          details: { $meta: 'scoreDetails' },
        },
      },
      {
        $project: {
          id: 1,
          score: 1,
          lexical: buildScoreDetail('lexical'),
          vector: buildScoreDetail('vector'),
        },
      },
    ];
  }

  return [
    vectorSearchStage,
    ...buildRankStages({
      component: 'vector',
      idPath,
      score: { $meta: 'vectorSearchScore' },
    }),
    {
      $unionWith: {
        coll: collection,
        pipeline: [
          ...searchPipeline,
          ...buildRankStages({ component: 'lexical', idPath, score: { $meta: 'searchScore' } }),
        ],
      },
    },
    { $group: { _id: '$id', lexical: { $min: '$lexical' }, vector: { $min: '$vector' } } },
    {
      $project: {
        _id: 0,
        id: '$_id',
        score: {
          $add: [
            buildReciprocalRank({ component: 'lexical', weight: weights.lexical }),
            buildReciprocalRank({ component: 'vector', weight: weights.vector }),
          ],
        },
        lexical: { $ifNull: ['$lexical', null] },
        vector: { $ifNull: ['$vector', null] },
      },
    },
    { $sort: { score: -1, id: 1 } },
    { $limit: limit },
  ];
}
