/**
 * services/shopifyFiles.js
 * Uploads files to Shopify CDN via the Admin GraphQL API.
 * Uses stagedUploadsCreate → PUT/POST → fileCreate pattern.
 */

const API_VERSION = '2024-01';

const gqlUrl     = (shop) => `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
const gqlHeaders = (token) => ({
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': token,
});

// Step 1: Request a pre-signed staged upload target
async function createStagedUpload(shop, token, { filename, mimeType, fileSize }) {
  const isImage  = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename);
  const resource = isImage ? 'IMAGE' : 'FILE';

  const res = await fetch(gqlUrl(shop), {
    method: 'POST',
    headers: gqlHeaders(token),
    body: JSON.stringify({
      query: `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters { name value }
            }
            userErrors { field message }
          }
        }
      `,
      variables: {
        input: [{
          filename,
          mimeType,
          fileSize: String(fileSize),
          resource,
          httpMethod: isImage ? 'PUT' : 'POST',
        }],
      },
    }),
  });

  const data = await res.json();
  if (data.errors?.length) throw new Error(`GraphQL error: ${data.errors[0].message}`);
  const errors = data.data?.stagedUploadsCreate?.userErrors;
  if (errors?.length) throw new Error(`Staged upload error: ${errors[0].message}`);
  const target = data.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url) throw new Error('Shopify did not return a staged upload URL');
  return target;
}

// Step 2a: Upload image via PUT (raw bytes)
async function putImage(stagedTarget, fileBuffer, mimeType) {
  const res = await fetch(stagedTarget.url, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: fileBuffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Image PUT failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return stagedTarget.resourceUrl;
}

// Step 2b: Upload file via POST multipart/form-data
async function postFileMultipart(stagedTarget, fileBuffer, filename, mimeType) {
  const form = new FormData();
  for (const { name, value } of stagedTarget.parameters) {
    form.append(name, value);
  }
  const blob = new Blob([fileBuffer], { type: mimeType });
  form.append('file', blob, filename);

  const res = await fetch(stagedTarget.url, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`File POST failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return stagedTarget.resourceUrl;
}

// Step 3: Register file with Shopify fileCreate
async function fileCreate(shop, token, resourceUrl, mimeType, filename) {
  const isImage = /image\//i.test(mimeType);
  const res = await fetch(gqlUrl(shop), {
    method: 'POST',
    headers: gqlHeaders(token),
    body: JSON.stringify({
      query: `
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              ... on MediaImage { id image { url } }
              ... on GenericFile { id url }
            }
            userErrors { field message }
          }
        }
      `,
      variables: {
        files: [{
          originalSource: resourceUrl,
          filename,
          contentType: isImage ? 'IMAGE' : 'FILE',
        }],
      },
    }),
  });
  const data = await res.json();
  if (data.errors?.length) throw new Error(`fileCreate GraphQL error: ${data.errors[0].message}`);
  const userErrors = data.data?.fileCreate?.userErrors;
  if (userErrors?.length) throw new Error(`fileCreate error: ${userErrors[0].message}`);
  const file = data.data?.fileCreate?.files?.[0];
  return file;
}

// Step 4: Poll until the CDN URL is available (async processing by Shopify)
async function pollForUrl(shop, token, resourceUrl, maxAttempts = 8, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, delayMs));

    const res = await fetch(gqlUrl(shop), {
      method: 'POST',
      headers: gqlHeaders(token),
      body: JSON.stringify({
        query: `
          query getFile($query: String!) {
            files(first: 1, query: $query) {
              edges {
                node {
                  ... on MediaImage { id image { url } }
                  ... on GenericFile { id url }
                }
              }
            }
          }
        `,
        variables: { query: `filename:${resourceUrl.split('/').pop()}` },
      }),
    });

    const data = await res.json();
    const node = data.data?.files?.edges?.[0]?.node;
    const url  = node?.image?.url || node?.url;
    if (url) return { id: node.id, url };
  }
  // If polling times out, return resourceUrl as fallback
  return { id: null, url: resourceUrl };
}

/**
 * Main export: upload file to Shopify CDN.
 * Returns { id, url } where url is the public CDN URL.
 */
export async function uploadToShopifyCDN(shop, token, fileBuffer, filename, mimeType) {
  const fileSize = fileBuffer.length;
  const isImage  = /image\//i.test(mimeType);

  // 1. Get staged upload target
  const stagedTarget = await createStagedUpload(shop, token, { filename, mimeType, fileSize });

  // 2. Upload the actual file bytes
  if (isImage) {
    await putImage(stagedTarget, fileBuffer, mimeType);
  } else {
    await postFileMultipart(stagedTarget, fileBuffer, filename, mimeType);
  }

  // 3. Register with Shopify
  await fileCreate(shop, token, stagedTarget.resourceUrl, mimeType, filename);

  // 4. Poll for CDN URL
  return pollForUrl(shop, token, stagedTarget.resourceUrl);
}
