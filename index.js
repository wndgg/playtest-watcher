
const { chromium } = require('playwright');

(async () => {
  console.log("Bot started at", new Date().toISOString());

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

  const telegramUrl =
    `https://api.telegram.org/bot${botToken}/sendMessage`;

  const PLAYTEST_URL =
    'https://app.weplaytestgames.com/dashboard/playtests';

  const INTERVAL = 15000;
  const trackedGames = {};

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    storageState: 'state.json'
  });

  const page = await context.newPage();

  page.setDefaultTimeout(5000);

  async function sendTelegram(message) {
    try {
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        console.error(
          "Telegram error:",
          response.status,
          await response.text()
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Telegram failed:", error.message);
      return false;
    }
  }

  while (true) {
    try {
      console.log(
        "Checking playtests:",
        new Date().toISOString()
      );

      const response = await page.goto(PLAYTEST_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      if (!response || !response.ok()) {
        throw new Error(
          `Page returned HTTP ${response?.status() ?? 'unknown'}`
        );
      }

      await page.waitForTimeout(3000);

      // Avoid treating a login page as an empty playtest list.
      if (!page.url().startsWith(PLAYTEST_URL)) {
        throw new Error(
          "Unexpected redirect: " + page.url()
        );
      }

      const cards = page.locator('div.card');
      const cardCount = await cards.count();

      console.log("Cards found:", cardCount);

      const currentGames = new Set();
      let incompleteScan = false;

      for (let i = 0; i < cardCount; i++) {
        try {
          const card = cards.nth(i);

          const hasClaim = await card
            .getByText('Claim Playtest', { exact: true })
            .count();

          if (hasClaim === 0) {
            continue;
          }

          const link = card.locator('a').first();

          // Skip safely if there is no title link.
          if (await link.count() === 0) {
            console.log(
              `Card ${i + 1}: Claim button found, but no link`
            );
            incompleteScan = true;
            continue;
          }

          const title = (
            await link.innerText({ timeout: 5000 })
          ).trim();

          if (!title) {
            console.log(
              `Card ${i + 1}: Empty game title`
            );
            incompleteScan = true;
            continue;
          }

          currentGames.add(title);

        } catch (error) {
          console.error(
            `Error reading card ${i + 1}:`,
            error.message
          );
          incompleteScan = true;
        }
      }

      // Missing cards may indicate a loading issue.
      // Avoid incorrectly deleting tracked games.
      if (cardCount === 0) {
        console.log(
          "No cards found. Keeping existing tracking."
        );
        incompleteScan = true;
      }

      const now = Date.now();

      // NEW GAMES
      for (const game of currentGames) {
        if (!trackedGames[game]) {
          trackedGames[game] = {
            count: 1,
            firstSeen: now
          };

          console.log("NEW PLAYTEST:", game);

          const timeStr = new Date().toISOString();

          const sent = await sendTelegram(
            `🚨 NEW PLAYTEST!\n\n` +
            `${game}\n\n` +
            `Detected at: ${timeStr}\n\n` +
            `OPEN:\n${PLAYTEST_URL}`
          );

          if (!sent) {
            console.log(
              "Notification failed for:", game
            );
          }

        } else {
          trackedGames[game].count++;
        }
      }

      // REMOVED GAMES
      // Only remove after a complete scan.
      if (!incompleteScan) {
        for (const game of Object.keys(trackedGames)) {
          if (!currentGames.has(game)) {
            const data = trackedGames[game];

            const seconds = Math.round(
              (now - data.firstSeen) / 1000
            );

            console.log("PLAYTEST ENDED:", game);
            console.log(
              `Visible for: ${data.count} checks (~${seconds}s)`
            );

            delete trackedGames[game];
          }
        }
      } else {
        console.log(
          "Incomplete scan. Skipping removal tracking."
        );
      }

      console.log(
        "Available games:",
        [...currentGames]
      );

    } catch (error) {
      console.error(
        "CHECK FAILED:",
        error.message
      );

      console.log(
        "Will retry on next check."
      );
    }

    await page.waitForTimeout(INTERVAL);
  }

})().catch(error => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
