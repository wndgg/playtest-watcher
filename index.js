const { chromium } = require('playwright');

(async () => {
  console.log("Bot started at", new Date().toISOString());

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

  const telegramUrl = "https://api.telegram.org/bot" + botToken + "/sendMessage";

  let trackedGames = {}; // { gameName: { count, firstSeen } }

  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    storageState: 'state.json'
  });

  const page = await context.newPage();

  const INTERVAL = 15000; // 15s

  while (true) {
    await page.goto('https://app.weplaytestgames.com/dashboard/playtests', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForTimeout(3000);

    const claimButtons = page.locator('text=Claim Playtest');
    const claimCount = await claimButtons.count();

    let currentGames = [];

    if (claimCount > 0) {
      const cards = page.locator('div.card');
      const cardCount = await cards.count();

      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i);
        const hasClaim = await card.locator('text=Claim Playtest').count();

        if (hasClaim > 0) {
          const title = (await card.locator('a').first().innerText()).trim();
          currentGames.push(title);
        }
      }
    }

    const now = Date.now();

    // --- UPDATE TRACKING ---
    currentGames.forEach(game => {
      if (!trackedGames[game]) {
        trackedGames[game] = {
          count: 1,
          firstSeen: now
        };

        // NEW GAME → ALERT
        const timeStr = new Date().toISOString();

        fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🚨 NEW PLAYTEST!\n\n${game}\n\nDetected at: ${timeStr}\n\nOPEN:\nhttps://app.weplaytestgames.com/dashboard/playtests`
          })
        });

      } else {
        trackedGames[game].count++;
      }
    });

    // --- CHECK REMOVED GAMES ---
    for (const game in trackedGames) {
      if (!currentGames.includes(game)) {
        const data = trackedGames[game];

        const durationMs = now - data.firstSeen;
        const seconds = Math.round(durationMs / 1000);

        console.log(`PLAYTEST ENDED: ${game}`);
        console.log(`Visible for: ${data.count} checks (~${seconds}s)`);

        // Optional: send Telegram when it disappears
        /*
        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `❌ PLAYTEST GONE\n\n${game}\n\nVisible for ~${seconds}s (${data.count} checks)`
          })
        });
        */

        delete trackedGames[game];
      }
    }

    await page.waitForTimeout(INTERVAL);
  }
})();