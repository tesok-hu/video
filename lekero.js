const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const ftp = require('basic-ftp');

puppeteer.use(StealthPlugin());

// ✅ FTP feltöltés
async function uploadToFTP(link) {
  const client = new ftp.Client();
  try {
    await client.access({
      host: "ftp.szervered.hu",
      user: "felhasznalonev",
      password: "jelszo",
      secure: false,
    });
    await client.uploadFrom(link, "/htdocs/video/streamlink.txt");
    console.log("\u2705 FTP feltöltés sikeres.");
  } catch (err) {
    console.log("\u274c FTP hiba:", err.message);
  }
  client.close();
}

// ✨ Link figyelés indítás
(async () => {
  const url = 'https://kozvetites.rf.gd/sweet/index2.php';
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Tiltunk mindent, ami nem kell
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resource = req.resourceType();
    if (["image", "stylesheet", "font"].includes(resource)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  let foundLink = null;
  let captured = false;

  // Video linkek figyelése
  page.on('response', async (response) => {
    const resUrl = response.url();
    const headers = response.headers();
    const contentLength = parseInt(headers['content-length'] || '0', 10);

    const isMp4 = resUrl.includes('.mp4');
    const isM3u8 = resUrl.includes('.m3u8');
    const estimatedDurationMin = (contentLength * 8) / (1000 * 1000 * 5); // 5 Mbps

    if (
      ((isMp4 && estimatedDurationMin >= 5) || isM3u8) &&
      !resUrl.includes('ad') && !resUrl.includes('blob') && !resUrl.includes('iframe')
    ) {
      if (!captured) {
        captured = true;
        foundLink = resUrl;
        fs.writeFileSync("current_video_link.txt", resUrl);
        console.log("\u2728 Videólink kinyerve:", resUrl);
        await uploadToFTP("current_video_link.txt");
      }
    }
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // Automatikus Enter + klikk
  await page.keyboard.press('Enter');
  const selectors = [
    'button.vjs-big-play-button',
    'div[class*="jw-icon"]',
    'button[data-plyr="play"]',
    'div[class*="play"]',
    'video',
    'button.plyr__control[data-plyr="play"]',
    'button.plyr__control'
  ];

  for (const selector of selectors) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click();
        console.log(`\u2705 Kattintás sikeres: ${selector}`);
        break;
      }
    } catch (e) {
      console.log(`\u26a0\ufe0f Hibás kattintás: ${selector}`);
    }
  }

  // Várjunk kicsit még linkre
  await new Promise(r => setTimeout(r, 10000));

  if (!foundLink) {
    const link = await page.evaluate(() => {
      try {
        if (typeof jwplayer === 'function') {
          const p = jwplayer();
          const playlist = p.getPlaylist();
          if (playlist && playlist[0].file) return playlist[0].file;
        }
        const video = document.querySelector('video');
        if (video && video.src && !video.src.startsWith('blob:')) {
          return video.src;
        }
      } catch {
        return null;
      }
    });

    if (link) {
      fs.writeFileSync("current_video_link.txt", link);
      console.log("\u2728 Evaluate kinyert link:", link);
      await uploadToFTP("current_video_link.txt");
    } else {
      fs.writeFileSync("current_video_link.txt", "NEM TALÁLHATÓ");
      console.log("\u274c Nem találtunk megfelelő linket.");
    }
  }

  await browser.close();
})();

