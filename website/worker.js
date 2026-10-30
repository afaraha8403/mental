/**
 * Serves the static Astro build and redirects www.getmental.dev to the
 * canonical apex https://getmental.dev. Preview on *.workers.dev is unchanged.
 * @param {Request} request
 * @param {{ASSETS: {fetch: (input: Request) => Promise<Response>}}} env
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.getmental.dev') {
      url.hostname = 'getmental.dev';
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
