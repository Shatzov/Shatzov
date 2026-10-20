// A preview build shows its banner and never calls create_file on the connector, even when an entry is saved.
import assert from 'node:assert/strict';
export default async function (page, ctx) {
  assert.equal(await page.locator('[data-testid="preview-banner"]').count(), 1, 'preview banner shown');
  const btn = page.locator('li.r12mg [data-testid="wl-mailgrp-conv-all"]').first();
  await btn.click(); await page.waitForTimeout(1500);
  const sent = (await ctx.writes()).filter((x) => x.tool === 'create_file').length;
  const kept = await page.evaluate(() => (window.__previewSaves || []).length);
  assert.equal(sent, 0, 'nothing reached the connector'); assert.ok(kept >= 1, 'the entry is kept in the page');
  console.log(JSON.stringify({ preview: 'ok', reached_connector: sent, kept_in_page: kept, banner: await page.locator('[data-testid="preview-banner"]').textContent() }));
}
