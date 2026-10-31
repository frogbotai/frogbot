const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

function page({ title, body, action }: { title: string; body: string; action: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; color: #111; background: #f6f6f6; }
main { max-width: 26rem; padding: 2rem; background: #fff; border-radius: 1rem; box-shadow: 0 1px 4px rgb(0 0 0 / 10%); }
h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
a.button { display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; border-radius: 999px; background: #111; color: #fff; text-decoration: none; }
</style>
</head>
<body><main><h1>${escape(title)}</h1><p>${body}</p>${action}</main></body>
</html>`;
}

/** OpenAI's notice for the first sign-in with plan use, with **Got it** back to the app. */
export function planNoticePage({ returnTo, usageUrl }: { returnTo: string; usageUrl: string }) {
  return page({
    title: 'You’re using your ChatGPT plan',
    body: `Eligible usage in this app uses your ChatGPT plan. Manage usage in your <a href="${escape(usageUrl)}">ChatGPT settings</a>.`,
    action: `<a class="button" href="${escape(returnTo)}">Got it</a>`,
  });
}

/** A failed sign-in: what went wrong, and a link back to Linked accounts. */
export function failurePage({ message, returnTo }: { message: string; returnTo: string }) {
  return page({
    title: 'ChatGPT sign-in didn’t finish',
    body: escape(message),
    action: `<a class="button" href="${escape(returnTo)}">Back to Linked accounts</a>`,
  });
}
