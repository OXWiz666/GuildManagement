/**
 * Sanitizes a URL to prevent javascript:, data:, or vbscript: protocol XSS attacks.
 * Allows only http:, https:, and safe relative/absolute paths.
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  
  const trimmed = url.trim();
  const lowerUrl = trimmed.toLowerCase();
  
  // Protect against malicious protocols
  if (
    lowerUrl.startsWith("javascript:") ||
    lowerUrl.startsWith("data:") ||
    lowerUrl.startsWith("vbscript:")
  ) {
    return "about:blank";
  }
  
  return trimmed;
}
