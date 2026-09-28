// Return only fixed messages to Glowstack; provider errors can contain private URLs.
export function workerErrorMessage(error) {
  const message = String(error?.message || '');
  if (error?.code === 'INCLUDED_USAGE_EXHAUSTED') {
    return 'Codex included usage is unavailable or exhausted. Check your Codex allowance before retrying. No API fallback was used.';
  }
  if (error?.code === 'ALLOWANCE_UNVERIFIED') {
    return 'The worker could not verify your included Codex allowance. Retry after checking the worker connection. No API fallback was used.';
  }
  if (/image.*(?:download|fetch|access|invalid)|(?:download|fetch|access).*image/i.test(message)) {
    return 'AI could not read an input image. Check that its thumbnail is accessible; Google Photos images may need to be re-imported. No API fallback was used.';
  }
  if (/rate.?limit|too many requests|\b429\b/i.test(message)) {
    return 'Codex temporarily rate-limited this request. Try again shortly. This does not by itself mean your subscription allowance is exhausted. No API fallback was used.';
  }
  if (/usage.?limit|quota/i.test(message)) {
    return 'Codex reported a usage restriction for this request. Check the account and model allowance; the worker has not confirmed that your entire subscription allowance is exhausted. No API fallback was used.';
  }
  return 'MCP analysis failed. Check the worker connection, Codex login, model access, and input images. No API fallback was used.';
}
