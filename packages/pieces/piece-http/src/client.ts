export async function sendHttpRequest({ url, init }: { url: URL; init: RequestInit }) {
  return fetch(url, init);
}
