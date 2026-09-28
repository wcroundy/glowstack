const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Only fetch public media storage hosts. Never fetch arbitrary/internal URLs or
// forward credentials; private Google Photos URLs must be imported first.
export async function inlineWorkerImage(value, fetchImpl = fetch) {
  // Retry only a download timeout, before inference. Never resubmit an AI job.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await downloadWorkerImage(value, fetchImpl);
    } catch (error) {
      if (error?.name !== 'TimeoutError' && error?.name !== 'AbortError') throw error;
      if (attempt === 1) throw Object.assign(new Error('Image download timed out after two attempts. Try again when the storage connection recovers.'), { code: 'IMAGE_DOWNLOAD_TIMEOUT' });
    }
  }
}

async function downloadWorkerImage(value, fetchImpl) {
  const url = new URL(value);
  const publicStorage = /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
    && url.pathname.startsWith('/storage/v1/object/public/');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !publicStorage) {
    throw new Error('Image access requires a public Supabase Storage thumbnail. Re-import external images into Glowstack first.');
  }
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Image download failed (HTTP ${response.status}). Check or re-import the thumbnail.`);
  }
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
    await response.body?.cancel();
    throw new Error('Invalid image content type; expected JPEG, PNG, WebP or GIF.');
  }
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body?.cancel();
    throw new Error('Image exceeds the worker thumbnail size limit.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_IMAGE_BYTES) throw new Error('Image exceeds the worker thumbnail size limit.');
    chunks.push(chunk);
  }
  if (!size) throw new Error('Image download returned empty data.');
  return `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`;
}
