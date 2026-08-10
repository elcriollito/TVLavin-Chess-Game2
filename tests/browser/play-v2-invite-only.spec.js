import { test, expect } from '@playwright/test';

test('superseded invite landing and direct invite document fail closed',async({page})=>{
  for(const path of ['/play/beta/invite','/play-v2-invite.html']){await page.goto(path);await expect(page).toHaveTitle(/Play Beta Unavailable/);await expect(page.locator('script')).toHaveCount(0);await expect(page.getByRole('button',{name:'Report an issue'})).toHaveCount(0);}
});

test('internal QA never mounts public or invite feedback UI',async({page})=>{await page.goto('/play?simplified=1');await expect(page.locator('body[data-caissa-play-v2-entry="qa-only"]')).toHaveCount(1);await expect(page.getByRole('button',{name:'Report an issue'})).toHaveCount(0);await expect(page.getByText('Public Beta',{exact:true})).toHaveCount(0);});
