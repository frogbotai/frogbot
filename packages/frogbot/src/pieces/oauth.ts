import type {
  PieceDefinition,
  PieceOAuthRecipe,
  PieceOAuthScopes,
  PieceOAuthSignIn,
} from './types.js';

type AnyRecipe = PieceOAuthRecipe<unknown, unknown> | PieceOAuthSignIn<unknown>;

/** True for a recipe whose piece runs the sign-in itself (`authorize`), not core's redirect flow. */
export function isPieceSignIn(recipe: AnyRecipe | undefined): recipe is PieceOAuthSignIn<unknown> {
  return typeof recipe?.authorize === 'function';
}

/** The piece's redirect-flow recipe, or `undefined` when it has none or runs its own sign-in. */
export function urlRecipe(
  definition: PieceDefinition,
): PieceOAuthRecipe<unknown, unknown> | undefined {
  const recipe = definition.oauth;

  return recipe && !isPieceSignIn(recipe) ? recipe : undefined;
}

function validateURLs(slug: string, recipe: PieceOAuthRecipe<unknown, unknown>): void {
  for (const [field, value] of [
    ['authorizationUrl', recipe.authorizationUrl],
    ['tokenUrl', recipe.tokenUrl],
  ] as const) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    } catch {
      throw new Error(`[frogbot] Piece '${slug}' OAuth ${field} must be an HTTP URL.`);
    }
  }

  if (recipe.params && Object.values(recipe.params).some((value) => typeof value !== 'string')) {
    throw new Error(`[frogbot] Piece '${slug}' OAuth params must contain strings.`);
  }
}

function validateSignIn(slug: string, recipe: PieceOAuthSignIn<unknown>): void {
  const urlFields = ['authorizationUrl', 'tokenUrl', 'pkce', 'params', 'account'] as const;

  if (urlFields.some((field) => recipe[field] !== undefined)) {
    throw new Error(
      `[frogbot] Piece '${slug}' OAuth authorize runs its own sign-in and takes no ${urlFields.join(', ')}.`,
    );
  }

  if (typeof recipe.refresh !== 'function') {
    throw new Error(`[frogbot] Piece '${slug}' OAuth authorize requires a refresh function.`);
  }
}

function validateScopes(slug: string, recipe: AnyRecipe): void {
  const { catalog, defaults, required = [] }: Partial<PieceOAuthScopes> = recipe.scopes ?? {};

  if (
    !catalog ||
    typeof catalog !== 'object' ||
    !Array.isArray(defaults) ||
    !Array.isArray(required) ||
    Object.entries(catalog).some(
      ([name, value]) => !name.trim() || typeof value !== 'string' || !value.trim(),
    )
  ) {
    throw new Error(
      `[frogbot] Piece '${slug}' OAuth scopes require a catalog of non-empty strings, defaults and required names.`,
    );
  }

  for (const name of [...defaults, ...required]) {
    if (!Object.hasOwn(catalog, name)) {
      throw new Error(`[frogbot] Piece '${slug}' scope '${String(name)}' is not in its catalog.`);
    }

    if (defaults.includes(name) && required.includes(name)) {
      throw new Error(`[frogbot] Piece '${slug}' scope '${name}' is both a default and required.`);
    }
  }
}

function validateShared(slug: string, recipe: AnyRecipe): void {
  if (recipe.revoke !== undefined && typeof recipe.revoke !== 'function') {
    throw new Error(`[frogbot] Piece '${slug}' OAuth revoke must be a function.`);
  }

  if (recipe.label !== undefined && (typeof recipe.label !== 'string' || !recipe.label.trim())) {
    throw new Error(`[frogbot] Piece '${slug}' OAuth label must be a non-empty string.`);
  }

  if (recipe.auth !== undefined && typeof recipe.auth?.parse !== 'function') {
    throw new Error(`[frogbot] Piece '${slug}' OAuth auth must be a schema.`);
  }
}

export function validateOAuthRecipe({ slug, auth, oauth }: PieceDefinition): void {
  if (!oauth) return;

  if (!auth) throw new Error(`[frogbot] Piece '${slug}' declares OAuth but no auth schema.`);

  if (isPieceSignIn(oauth)) validateSignIn(slug, oauth);
  else validateURLs(slug, oauth);

  validateScopes(slug, oauth);
  validateShared(slug, oauth);
}
