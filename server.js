const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("FATAL ERROR: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set.");
}

app.use(cors());
app.use(express.json());

// ============================================================
// Core: Puppeteer launch configuration (critical fix)
// ============================================================
async function fetchAllPasswords() {
    console.log("Starting Puppeteer scraping...");

    const launchOptions = {
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    };

    // Key: if an executable path is set in the environment variables, use it
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        console.log("Using Chrome path:", launchOptions.executablePath);
    }

    let browser;
    try {
        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        const allPasswords = [];

        // --- Your original scraping logic (keeping the placeholders) ---
        await page.goto('https://web.whatsapp.com/shortcuts', { waitUntil: 'networkidle2' });
        allPasswords.push({ serviceName: 'Chrome Profile', username: 'local_user', password: 'ScrapedPass_Chrome', source: 'Browser DB/WA' });

        await page.goto('https://www.facebook.com/login');
        allPasswords.push({ serviceName: 'Facebook', username: 'FB_Scrape', password: 'FB_Scraped_Pass', source: 'Facebook Web Scrape' });

        allPasswords.push({ serviceName: 'Gmail', username: 'Gmail_API', password: 'Gmail_Scraped_Pass', source: 'Gmail API' });

        console.log(`Scraping complete. Found ${allPasswords.length} records.`);
        return allPasswords;
    } catch (e) {
        console.error("Puppeteer error:", e.message);
        // Throw the real error, don't silently return an empty array
        throw new Error("Scraper failed: " + e.message);
    } finally {
        if (browser) await browser.close();
    }
}

// ============================================================
// API endpoints
// ============================================================

app.get('/api/report/all', async (req, res) => {
    try {
        const passwords = await fetchAllPasswords();
        res.json(passwords);
    } catch (error) {
        console.error("GET /api/report/all failed:", error.message);
        // Return detailed error for easy diagnosis
        res.status(500).json({
            message: "Failed to fetch passwords.",
            detail: error.message
        });
    }
});

app.post('/api/notify/telegram', async (req, res) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return res.status(500).json({ message: 'Configuration Error: Telegram credentials missing.' });
    }
    try {
        const message = "🔔 New Password Dump Available! Check the Dashboard!";
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        await axios.post(telegramUrl, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        res.status(200).json({ message: 'Notification successfully triggered.' });
    } catch (error) {
        console.error("Telegram error:", error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Failed to send Telegram notification.' });
    }
});

app.post('/api/report/add', async (req, res) => {
    const newPassword = req.body;
    console.log('Received manual entry:', newPassword);
    // Note: there is no database here, so entries are not persisted
    // The frontend refresh will only re-fetch scraped data, not manual entries
    res.status(201).json({ message: "Password added successfully." });
});

app.listen(PORT, () => {
    console.log(`✅ Backend API running on port ${PORT}`);
});
