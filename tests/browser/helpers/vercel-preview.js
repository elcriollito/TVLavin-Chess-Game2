import { expect } from '@playwright/test';

export async function authorizeVercelPreview(page) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypass) return;
  const response = await page.request.get('/favicon-test.html', { headers: {
    'x-vercel-protection-bypass': bypass,
    'x-vercel-set-bypass-cookie': 'true'
  } });
  expect(response.status()).toBe(200);
}
