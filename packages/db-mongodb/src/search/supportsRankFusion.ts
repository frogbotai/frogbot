import { getErrorCode } from './createSearchSetupError.js';
import type { SearchModel, SearchPipeline } from './getSearchModel.js';

const unsupportedCodes = new Set([224, 40324]);

const rankFusionSupport = new WeakMap<object, Promise<boolean>>();

export function supportsRankFusion(Model: SearchModel): Promise<boolean> {
  const connection = Model.db;
  const cached = rankFusionSupport.get(connection);

  if (cached) return cached;

  const pipeline = [
    { $rankFusion: { input: { pipelines: { probe: [{ $sort: { _id: 1 } }, { $limit: 1 }] } } } },
    { $limit: 1 },
  ];

  const supported = Model.aggregate(pipeline as unknown as SearchPipeline)
    .exec()
    .then(
      () => true,
      (error: unknown) => {
        const code = getErrorCode(error);

        if (typeof code === 'number' && unsupportedCodes.has(code)) return false;

        rankFusionSupport.delete(connection);

        throw error;
      },
    );

  rankFusionSupport.set(connection, supported);

  return supported;
}
