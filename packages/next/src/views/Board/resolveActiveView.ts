export function resolveActiveViewSlug({
  routeSegments,
  viewType,
  views,
}: {
  routeSegments?: string[];
  viewType?: string;
  views?: Array<{ path: string; slug: string }>;
}): string | undefined {
  const routePath = `/${routeSegments?.slice(2).join('/') ?? ''}`.replace(/\/$/, '');
  return views?.find((view) => view.slug === viewType || view.path === routePath)?.slug;
}
