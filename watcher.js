const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const botToken = "8712346997:AAE31J9kiSaAO75PWADt5nRr6t34sEKNUYw";
  const chatId = "7088414320";
  const telegramUrl = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  const seenFile = 'last_seen_game.txt';

  let lastSeenGame = '';
  if (fs.existsSync(seenFile)) {
    lastSeenGame = fs.readFileSync(seenFile, 'utf8').trim();
  }

  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    storageState: 'state.json'
  });

  const page = await context.newPage();

  while (true) {
    console.log("Checking for playtests...");

    await page.goto('https://app.weplaytestgames.com/dashboard/playtests', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForTimeout(3000);

    const claimButton = page.locator('text=Claim Playtest').first();
    const claimCount = await page.locator('text=Claim Playtest').count();

    if (claimCount > 0) {
      const card = claimButton.locator('xpath=ancestor::div[contains(@class,"card")]').first();
      const gameLink = card.locator('a').first();
      const gameName = (await gameLink.innerText()).trim();

      console.log("PLAYTEST FOUND:", gameName);
      console.log("LAST SEEN:", lastSeenGame || "(none)");

      if (gameName !== lastSeenGame) {
        console.log("NEW PLAYTEST DETECTED. Sending Telegram alert...");

        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🚨 NEW PLAYTEST FOUND!\n\n${gameName}\n\nOPEN NOW:\nhttps://app.weplaytestgames.com/dashboard/playtests`
          })
        });

        fs.writeFileSync(seenFile, gameName, 'utf8');
        lastSeenGame = gameName;
      } else {
        console.log("Same playtest as before. No Telegram alert sent.");
      }
    } else {
      console.log("No playtest available.");
    }

    await page.waitForTimeout(15000);
  }
})();