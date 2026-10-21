const base = 'https://frogbot.ai/?utm_source=dojo&utm_medium=badge';

/** The badge link, tagged with the app's slug when the page is on `<slug>.frogbot.app`. */
export function badgeHref(hostname: string): string {
  const slug = /^([^.]+)\.frogbot\.app$/i.exec(hostname)?.[1];

  return slug ? `${base}&utm_content=${encodeURIComponent(slug.toLowerCase())}` : base;
}
