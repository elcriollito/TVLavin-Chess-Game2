import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const route = '/blog/caissa-polyglot-book-creator-v031';

async function prepare(page) {
  await page.addInitScript(() => {
    localStorage.setItem('caissa_onboarding_completed', 'true');
    localStorage.setItem('caissa.locale', 'en');
  });
}

test('Book Creator release article exposes the approved editorial and SEO contract', async ({ page }) => {
  await prepare(page);
  await page.goto(route);

  await expect(page).toHaveTitle('CAISSA Polyglot Book Creator v0.3.1 | Free PGN to BIN');
  await expect(page.locator('h1')).toHaveText('CAISSA Polyglot Book Creator v0.3.1: Bigger Books, Offline Performance & Integrity');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://www.caissa-chess.org${route}`);
  await expect(page.locator('article img')).toHaveAttribute('alt', /Carlsen PGN collection/);
  await expect(page.locator('article img')).toHaveJSProperty('complete', true);
  expect(await page.locator('article img').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight })))
    .toEqual({ width: 1920, height: 1020 });

  await expect(page.locator('a[href="/downloads"]')).not.toHaveCount(0);
  await expect(page.locator('a[href="/tools/polyglot"]')).not.toHaveCount(0);
  await expect(page.locator('a[href="https://github.com/elcriollito/CAISSA-Book-Creator/releases/tag/v0.3.1"]'))
    .toHaveAttribute('rel', 'noopener');

  const posting = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes =>
    nodes.map(node => JSON.parse(node.textContent)).find(item => item['@type'] === 'BlogPosting')
  );
  expect(posting.mainEntityOfPage).toBe(`https://www.caissa-chess.org${route}`);
  expect(posting.image).toBe('https://www.caissa-chess.org/assets/blog/caissa-book-creator-v031-carlsen.webp');
});

test('Book Creator article remains readable from 320px through desktop without overflow', async ({ page }) => {
  await prepare(page);
  for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
      await page.goto(route);
      const metrics = await page.evaluate(() => {
        const article = document.querySelector('article').getBoundingClientRect();
        const image = document.querySelector('article img').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          articleInside: article.left >= -1 && article.right <= innerWidth + 1,
          imageInside: image.left >= -1 && image.right <= innerWidth + 1,
          h1Lines: Math.round(document.querySelector('h1').getBoundingClientRect().height
            / Number.parseFloat(getComputedStyle(document.querySelector('h1')).lineHeight))
        };
      });
      expect(metrics.overflow, `${width}px page overflow`).toBeLessThanOrEqual(1);
      expect(metrics.articleInside, `${width}px article bounds`).toBe(true);
      expect(metrics.imageInside, `${width}px image bounds`).toBe(true);
      expect(metrics.h1Lines, `${width}px heading rendering`).toBeGreaterThanOrEqual(1);
    });
  }
});

test('Book Creator article main content passes automated accessibility checks', async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);

  const results = await new AxeBuilder({ page }).include('main').analyze();
  expect(results.violations).toEqual([]);
});
