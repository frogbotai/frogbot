import type { TypeWithID, Where } from 'payload';
import { hasAutosaveEnabled, slugify as defaultSlugify } from 'payload/shared';

import type { FieldHook } from '../../config/types.js';
import type { Slugify } from './index.js';

type GenerateSlugArgs = {
  checkboxName: string;
  slugFieldName: string;
  slugify?: Slugify;
  useAsSlug: string;
};

async function resolveSlug({
  customSlugify,
  data,
  req,
  valueToSlugify,
}: {
  customSlugify?: Slugify;
  data: TypeWithID;
  req: Parameters<Slugify>[0]['req'];
  valueToSlugify?: any;
}) {
  if (customSlugify) {
    return await customSlugify({ data, req, valueToSlugify });
  }

  return defaultSlugify(valueToSlugify);
}

export const generateSlug =
  ({
    checkboxName,
    slugFieldName,
    slugify: customSlugify,
    useAsSlug,
  }: GenerateSlugArgs): FieldHook =>
  async ({ collection, data, operation, originalDoc, req, siblingData, value }) => {
    if (operation === 'create') {
      if (data) {
        data[slugFieldName] = await resolveSlug({
          customSlugify,
          data: data as TypeWithID,
          req,
          valueToSlugify: data[slugFieldName] || data[useAsSlug],
        });
      }

      siblingData[checkboxName] = Boolean(!data?.[slugFieldName]);

      return data?.[slugFieldName];
    }

    if (operation !== 'update') {
      return;
    }

    if (!siblingData[checkboxName]) {
      return value;
    }

    if (!hasAutosaveEnabled(collection!)) {
      if (data) {
        data[slugFieldName] = await resolveSlug({
          customSlugify,
          data: data as TypeWithID,
          req,
          valueToSlugify: data[useAsSlug],
        });
      }

      siblingData[checkboxName] = Boolean(!data?.[slugFieldName]);

      return data?.[slugFieldName];
    }

    const isPublishing = data?._status === 'published';
    const userOverride =
      Boolean(data && Object.hasOwn(data, slugFieldName)) &&
      data?.[slugFieldName] !== originalDoc?.[slugFieldName];

    if (!userOverride && data) {
      data[slugFieldName] = data[useAsSlug]
        ? await resolveSlug({
            customSlugify,
            data: data as TypeWithID,
            req,
            valueToSlugify: data[useAsSlug],
          })
        : null;
    }

    if (isPublishing || userOverride) {
      siblingData[checkboxName] = false;

      return data?.[slugFieldName];
    }

    const where: Where = {
      parent: {
        equals: originalDoc?.id,
      },
    };

    const { totalDocs } = await req.frogbot.countVersions({
      collection: collection!.slug,
      where,
    });

    siblingData[checkboxName] = totalDocs <= 2;

    return data?.[slugFieldName];
  };
