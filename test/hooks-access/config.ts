import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  hookOrderSlug,
  reqAccessSlug,
  accessBooleanSlug,
  accessWhereSlug,
  fieldAccessSlug,
  validateSlug,
  afterOpSlug,
  contextFlowSlug,
  overrideAccessSlug,
  usersSlug,
} from './shared.js';

// ── Side-effect log for hook ordering tests ───────────────────────────

export let hookLog: string[] = [];
export function clearHookLog() {
  hookLog = [];
}

// ── 1. hook-order ─────────────────────────────────────────────────────

const HookOrder: CollectionConfig = {
  slug: hookOrderSlug,
  access: openAccess,
  hooks: {
    beforeValidate: [
      ({ req }) => {
        hookLog.push('beforeValidate');
      },
    ],
    beforeChange: [
      ({ data }) => {
        hookLog.push('beforeChange');
        return data;
      },
    ],
    afterChange: [
      ({ doc }) => {
        hookLog.push('afterChange');
        return doc;
      },
    ],
    beforeRead: [
      ({ doc }) => {
        hookLog.push('beforeRead');
      },
    ],
    afterRead: [
      ({ doc }) => {
        hookLog.push('afterRead');
        return doc;
      },
    ],
    beforeDelete: [
      ({ req }) => {
        hookLog.push('beforeDelete');
      },
    ],
    afterDelete: [
      ({ doc }) => {
        hookLog.push('afterDelete');
        return doc;
      },
    ],
  },
  fields: [{ name: 'title', type: 'text', required: true }],
};

// ── 2. req-access ─────────────────────────────────────────────────────

const ReqAccess: CollectionConfig = {
  slug: reqAccessSlug,
  access: openAccess,
  hooks: {
    beforeChange: [
      async ({ req, data, operation }) => {
        const result = await req.frogbot.find({ collection: reqAccessSlug, limit: 0, req });
        req.context.countAtHookTime = result.totalDocs;
        return data;
      },
    ],
    afterChange: [
      async ({ req, doc }) => {
        if (req.context._reqAccessUpdating) return doc;
        const count = req.context.countAtHookTime as number;
        if (typeof count === 'number') {
          req.context._reqAccessUpdating = true;
          await req.frogbot.update({
            collection: reqAccessSlug,
            id: doc.id,
            data: { hookCount: count },
            overrideAccess: true,
            req,
            context: { _reqAccessUpdating: true },
          });
        }
        return doc;
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'hookCount', type: 'number' },
  ],
};

// ── 3. access-boolean ─────────────────────────────────────────────────

const AccessBoolean: CollectionConfig = {
  slug: accessBooleanSlug,
  access: {
    create: () => true,
    read: () => true,
    update: () => false,
    delete: () => false,
  },
  fields: [{ name: 'title', type: 'text' }],
};

// ── 4. access-where ───────────────────────────────────────────────────

const AccessWhere: CollectionConfig = {
  slug: accessWhereSlug,
  access: {
    create: () => true,
    read: () => ({ hidden: { not_equals: true } }),
    update: () => true,
    delete: () => true,
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'hidden', type: 'checkbox', defaultValue: false },
  ],
};

// ── 5. field-access ───────────────────────────────────────────────────

const FieldAccess: CollectionConfig = {
  slug: fieldAccessSlug,
  access: openAccess,
  fields: [
    {
      name: 'secret',
      type: 'text',
      access: {
        read: () => false,
        update: () => false,
      },
    },
    {
      name: 'public',
      type: 'text',
    },
  ],
};

// ── 6. validate-ctx ───────────────────────────────────────────────────

const ValidateCtx: CollectionConfig = {
  slug: validateSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'mustMatch',
      type: 'text',
      validate: (value, options) => {
        if (!options.req?.frogbot) {
          return 'req.frogbot is not available';
        }
        if (value !== options.data?.title) {
          return 'mustMatch must equal title';
        }
        return true;
      },
    },
  ],
};

// ── 7. after-operation ────────────────────────────────────────────────

const AfterOperation: CollectionConfig = {
  slug: afterOpSlug,
  access: openAccess,
  hooks: {
    afterChange: [
      ({ doc }) => {
        return { ...doc, title: `${doc.title} [processed]` };
      },
    ],
  },
  fields: [{ name: 'title', type: 'text', required: true }],
};

// ── 8. context-flow ───────────────────────────────────────────────────

const ContextFlow: CollectionConfig = {
  slug: contextFlowSlug,
  access: openAccess,
  hooks: {
    beforeChange: [
      ({ context, data }) => {
        if (!context.seedValue) {
          context.seedValue = 'seeded';
        }
        return data;
      },
    ],
    afterChange: [
      async ({ req, doc, context }) => {
        if (context._contextFlowUpdating) return doc;
        const seed = context.seedValue as string | undefined;
        if (seed) {
          await req.frogbot.update({
            collection: contextFlowSlug,
            id: doc.id,
            data: { contextResult: seed },
            overrideAccess: true,
            req,
            context: { _contextFlowUpdating: true },
          });
        }
        return doc;
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'contextResult', type: 'text' },
  ],
};

// ── 9. override-access ────────────────────────────────────────────────

const OverrideAccess: CollectionConfig = {
  slug: overrideAccessSlug,
  access: {
    create: () => true,
    read: () => false,
    update: () => true,
    delete: () => true,
  },
  hooks: {
    beforeRead: [
      ({ req, overrideAccess }) => {
        req.context.overrideAccessValue = overrideAccess;
      },
    ],
  },
  fields: [{ name: 'title', type: 'text' }],
};

// ── 10. users (auth) ──────────────────────────────────────────────────

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: {
    verify: true,
    maxLoginAttempts: 2,
    lockTime: 600 * 1000,
  },
  access: openAccess,
  hooks: {
    afterLogin: [
      async ({ req, user }) => {
        await req.frogbot.update({
          collection: usersSlug,
          id: user.id,
          data: { lastLogin: new Date().toISOString() },
          overrideAccess: true,
          req,
        });
        return user;
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'lastLogin', type: 'text' },
  ],
};

// ── Export config ─────────────────────────────────────────────────────

export default await buildTestConfig({
  collections: [
    HookOrder,
    ReqAccess,
    AccessBoolean,
    AccessWhere,
    FieldAccess,
    ValidateCtx,
    AfterOperation,
    ContextFlow,
    OverrideAccess,
    Users,
  ],
});
