import type { CollectionConfig, FrogBotRequest, Where } from 'frogbot';

export type TenantID = number | string;

/**
 * The tenants a signed-in user belongs to, the ones where they are at least an editor, the ones they admin (owners
 * included) and the ones they own.
 */
export type TenantMemberships = {
  all: TenantID[];
  editable: TenantID[];
  admin: TenantID[];
  owner: TenantID[];
};

/**
 * The member roles, lowest first, in the members collection's `role` field. Each tenant has exactly one `owner`, who
 * passes every admin check; only a handover makes someone else the owner.
 */
export const tenantRoles = ['viewer', 'editor', 'admin', 'owner'] as const;

export type TenantRole = (typeof tenantRoles)[number];

/** The roles an invite or a role change may give: every role but `owner`. */
export const assignableRoles = ['viewer', 'editor', 'admin'] as const;

export type AssignableRole = (typeof assignableRoles)[number];

/** The signed-in user a personal tenant is made for. */
export type TenantUser = {
  id: TenantID;
  email?: unknown;
  name?: unknown;
  [key: string]: unknown;
};

export type PersonalTenantOptions = {
  /** The new tenant's name. Defaults to "Colby's workspace", from the first name or the email. */
  name?: (user: TenantUser) => string;
  /** Users who get no personal tenant, such as service accounts. */
  skip?: (user: TenantUser) => boolean;
  /** More fields for the new tenant, such as a mark that it is this user's own. */
  data?: (user: TenantUser) => Record<string, unknown>;
  /**
   * Finds the user's own tenant: a sign-in that finds none makes one. Defaults to any tenant the user is a member of.
   *
   * @example
   * own: (user) => ({ personalOf: { equals: user.id } })
   */
  own?: (user: TenantUser) => Where;
};

export type TenancyPluginOptions = {
  /** The auth collection members link to. Defaults to `users`. */
  authCollection?: string;
  /** The tenants collection's slug. Defaults to `tenants`. */
  tenantsSlug?: string;
  /** The members collection's slug. Defaults to `members`. */
  membersSlug?: string;
  /** The members collection's relationship to its tenant. Defaults to `tenant`. */
  tenantField?: string;
  /** Merged into the tenants collection: fields are added, hooks run after the plugin's, access replaces it per operation. */
  tenants?: Partial<CollectionConfig>;
  /** Merged into the members collection the same way. */
  members?: Partial<CollectionConfig>;
  /** Users who read and manage every tenant and member, such as staff. */
  isSuperUser?: (req: FrogBotRequest) => boolean | Promise<boolean>;
  /** The one tenant a request is limited to, such as an API key made for it; `myTenants` keeps only that one. */
  requestTenant?: (req: FrogBotRequest) => TenantID | undefined;
  /**
   * How the owner hands a tenant over, named in every refusal to make someone the owner.
   *
   * @example
   * handover: 'POST /api/workspaces/:id/owner'
   */
  handover?: string;
  /** Makes a tenant, owned by the user, at a sign-in that finds them owning none of their own. Off by default. */
  personalTenant?: boolean | PersonalTenantOptions;
};

/** `tenancyPlugin` options with defaults filled, read by other plugins through `plugins['plugin-tenancy']`. */
export type TenancyResolvedOptions = Omit<TenancyPluginOptions, 'personalTenant'> &
  Required<
    Pick<TenancyPluginOptions, 'authCollection' | 'membersSlug' | 'tenantField' | 'tenantsSlug'>
  > & {
    personalTenant?: PersonalTenantOptions;
  };
