const fetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const path = {
    'https://oauth2.googleapis.com/token': '/token',
    'https://www.googleapis.com/oauth2/v3/userinfo': '/userinfo',
  }[url.href];
  if (path) return fetch(new URL(path, process.env.SMOKE_PROVIDER_URL), init);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(`Business QA smoke blocked external request to ${url.origin}`);
  }
  return fetch(input, init);
};
