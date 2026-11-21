const SUPPORTED_LANGS = new Set(["en", "de", "fr", "es", "it", "zh", "ko"]);
const STATIC_ASSET_EXT_RE = /\.(?:css|js|mjs|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|mp4|webm|pdf|txt|xml|map)$/i;

function isTeamsSpaRoute(pathname) {
  if (STATIC_ASSET_EXT_RE.test(pathname)) return false;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1 && (parts[0] === "teams" || parts[0] === "teams-portal")) {
    return true;
  }
  if (parts.length === 2 && parts[0] === "teams") {
    return true;
  }
  if ((parts.length === 2 || parts.length === 3) && SUPPORTED_LANGS.has(parts[0]) && parts[1] === "teams") {
    return true;
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isTeamsSpaRoute(url.pathname)) {
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
