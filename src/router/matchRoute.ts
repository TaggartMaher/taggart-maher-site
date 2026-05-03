// Pure path matcher: given a route pattern with optional `:name`
// segments and a concrete path, return the captured params or null
// when the pattern does not match. Trailing slashes are normalized.

export interface RouteMatch {
  params: Record<string, string>;
}

function splitSegments(path: string): string[] {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return [];
  return trimmed.split("/");
}

export function matchRoute(pattern: string, path: string): RouteMatch | null {
  const patternSegments = splitSegments(pattern);
  const pathSegments = splitSegments(path);
  if (patternSegments.length !== pathSegments.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let segmentIndex = 0; segmentIndex < patternSegments.length; segmentIndex++) {
    const patternSegment = patternSegments[segmentIndex];
    const pathSegment = pathSegments[segmentIndex];
    if (patternSegment.startsWith(":")) {
      const paramName = patternSegment.slice(1);
      params[paramName] = decodeURIComponent(pathSegment);
    } else if (patternSegment !== pathSegment) {
      return null;
    }
  }
  return { params };
}
