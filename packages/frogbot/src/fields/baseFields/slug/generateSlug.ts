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

    const isChecked =
      siblingData[checkboxName] === undefined
        ? originalDoc?.[checkboxName]
        : siblingData[checkboxName];

    if (!isChecked) {
      return value;
    }

    const userOverride =
      Boolean(data && Object.hasOwn(data, slugFieldName)) &&
      data?.[slugFieldName] !== originalDoc?.[slugFieldName];

    if (userOverride) {
      siblingData[checkboxName] = false;

      return data?.[slugFieldName];
    }

    const sourceValue = data?.[useAsSlug];
    const valueToSlugify = sourceValue === undefined ? originalDoc?.[useAsSlug] : sourceValue;

    if (!hasAutosaveEnabled(collection!)) {
      if (data) {
        data[slugFieldName] = await resolveSlug({
          customSlugify,
          data: data as TypeWithID,
          req,
          valueToSlugify,
        });
      }

      siblingData[checkboxName] = Boolean(!data?.[slugFieldName]);

      return data?.[slugFieldName];
    }

    const isPublishing = data?._status === 'published';

    if (data) {
      data[slugFieldName] = valueToSlugify
        ? await resolveSlug({
            customSlugify,
            data: data as TypeWithID,
            req,
            valueToSlugify,
          })
        : null;
    }

    if (isPublishing) {
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
      req,
      where,
    });

    siblingData[checkboxName] = totalDocs <= 2;

    return data?.[slugFieldName];
  };
