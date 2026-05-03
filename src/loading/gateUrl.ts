export const FORCE_COMPOSITOR_SESSION_KEY = "forceCompositor";

// Strips `?mode=` from the current URL while preserving the rest of
// the query string and the path. Exported so tests can exercise it
// directly.
export function stripModeFromUrl(currentUrl: URL): string {
  const params = currentUrl.searchParams;
  params.delete("mode");
  const queryString = params.toString();
  const suffix = queryString.length > 0 ? `?${queryString}` : "";
  return `${currentUrl.pathname}${suffix}${currentUrl.hash}`;
}
