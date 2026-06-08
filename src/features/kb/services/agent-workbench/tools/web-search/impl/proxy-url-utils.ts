/**
 * Proxy URL builder for web page reading.
 * Pure utility — no side effects, no runtime dependencies.
 */

/**
 * Build the full proxy request URL from a user-configured endpoint
 * and the target page URL.
 *
 * @param endpoint — e.g. "https://my-proxy.com/read" or "https://my-proxy.com/read?url={url}"
 * @param targetUrl — the target web page URL to fetch via the proxy
 */
export function buildReadProxyUrl(endpoint: string, targetUrl: string): string {
  const encoded = encodeURIComponent(targetUrl);

  // Support {url} placeholder
  if (endpoint.includes("{url}")) {
    return endpoint.replace(/\{url\}/g, encoded);
  }

  // endpoint already has query params — append &url=
  if (endpoint.includes("?")) {
    return `${endpoint}&url=${encoded}`;
  }

  // No query params — append ?url=
  return `${endpoint}?url=${encoded}`;
}
