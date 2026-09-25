import type {
  Access,
  CollectionConfig,
  FieldAccess,
  FrogBotInstance,
  FrogBotRequest,
  NumberField,
} from 'frogbot';

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => {
      if (req.user) return true;

      return {
        status: { equals: 'published' },
      };
    },
    update: ({ req }) => {
      if (!req.user) return false;

      return {
        author: { equals: req.user.id },
      };
    },
    delete: ({ req }) => Boolean(req.user),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'status',
      type: 'select',
      options: ['draft', 'published'],
      defaultValue: 'draft',
      index: true,
    },
    { name: 'author', type: 'relationship', relationTo: 'users', index: true },
  ],
};

export const anyone: Access = () => true;

export const authenticated: Access = ({ req }) => Boolean(req.user);

export const authenticatedOrPublished: Access = ({ req }) => {
  if (req.user) return true;

  return {
    _status: { equals: 'published' },
  };
};

export const canReadSalary: FieldAccess = ({ doc, req }) => {
  if (!req.user) return false;

  if (req.user.id === doc?.id) return true;

  return Array.isArray(req.user.roles) && req.user.roles.includes('admin');
};

export const canUpdateSalary: FieldAccess = ({ req }) => {
  return Array.isArray(req.user?.roles) && req.user.roles.includes('admin');
};

export const salaryField: NumberField = {
  name: 'salary',
  type: 'number',
  access: {
    read: canReadSalary,
    update: canUpdateSalary,
  },
};

export async function enforceUserAccess({
  frogbot,
  user,
}: {
  frogbot: FrogBotInstance;
  user: FrogBotRequest['user'];
}) {
  const result = await frogbot.find({
    collection: 'posts',
    user,
    overrideAccess: false,
  });

  return result;
}

export async function enforceRequestAccess(req: FrogBotRequest) {
  const result = await req.frogbot.find({
    collection: 'posts',
    req,
    overrideAccess: false,
  });

  return result;
}

export const canDeleteCustomer: Access = async ({ id, req }) => {
  if (!id) return false;

  const contracts = await req.frogbot.find({
    collection: 'contracts',
    depth: 0,
    limit: 0,
    req,
    where: { customer: { equals: id } },
  });

  return contracts.totalDocs === 0;
};

export const Customers: CollectionConfig = {
  slug: 'customers',
  access: { delete: canDeleteCustomer },
  fields: [{ name: 'name', type: 'text' }],
};

export const Contracts: CollectionConfig = {
  slug: 'contracts',
  fields: [{ name: 'customer', type: 'relationship', relationTo: 'customers' }],
};
