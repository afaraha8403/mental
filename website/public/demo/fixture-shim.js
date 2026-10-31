/**
 * Answers `/api/*` from the canned sample so the copied dashboard never
 * calls the network. A classic script runs before the dashboard module,
 * which fetches on its first evaluation.
 */
const xhr = new XMLHttpRequest();
xhr.open("GET", "./fixture.json", false);
xhr.send();
if (xhr.status !== 200) {
  throw new Error("Sample dashboard fixture failed to load.");
}
const fixture = JSON.parse(xhr.responseText);
const routes = fixture.routes || {};
const origFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, location.origin);
  if (!url.pathname.startsWith("/api/")) return origFetch(input, init);
  const key = url.pathname + url.search;
  const body = Object.prototype.hasOwnProperty.call(routes, key)
    ? routes[key]
    : { ok: true, data: null };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
