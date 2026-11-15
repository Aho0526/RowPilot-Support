export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      url.pathname === "/teams" ||
      url.pathname.startsWith("/teams/") ||
      url.pathname === "/teams-portal" ||
      url.pathname === "/teams-portal/"
    ) {
      const target = new URL("/teams/", url.origin);
      const assetRes = await env.ASSETS.fetch(target);
      const headers = new Headers(assetRes.headers);
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      return new Response(assetRes.body, {
        status: 200,
        headers
      });
    }
    return env.ASSETS.fetch(request);
  }
};
