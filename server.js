const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const SCRAPE_TIMEOUT_MS = parseInt(process.env.SCRAPE_TIMEOUT_MS || '45000', 10);

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("FATAL: Telegram credentials missing.");
}

app.use(cors());
app.use(express.json());

// In-memory manual entries (replace with DB later)
const manualEntries = [];

async function fetchScrapedData() {
    console.log("Launching Puppeteer...");
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: CHROME_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        timeout: SCRAPE_TIMEOUT_MS,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(SCRAPE_TIMEOUT_MS);
    const results = [];

    // These are pages Puppeteer can actually visit and extract visible text from
    const targets = [
        { name: 'WhatsApp Web', url: 'https://web.whatsapp.com/' },
        { name: 'Facebook Login', url: 'https://www.facebook.com/login' },
        { name: 'Google Accounts', url: 'https://accounts.google.com/' },
    ];

    try {
        for (const t of targets) {
            try {
                console.log(`Visiting ${t.name}: ${t.url}`);
                await page.goto(t.url, { waitUntil: 'domcontentloaded' });

                // Extract visible text on the page (limited to 200 characters)
                const visibleText = await page.evaluate(() => {
                    const body = document.body;
                    if (!body) return '(empty page)';
                    return body.innerText.replace(/\s+/g, ' ').trim().slice(0, 200);
                });

                results.push({
                    serviceName: t.name,
                    username: '(see page text)',
                    password: '(not accessible)',
                    source: `Page text: ${visibleText || '(blank)'}`,
                });
                console.log(`✓ ${t.name} extracted ${visibleText.length} chars`);
            } catch (err) {
                console.error(`✗ ${t.name} failed: ${err.message}`);
                results.push({
                    serviceName: t.name,
                    username: '—',
                    password: '—',
                    source: `Error: ${err.message}`,
                });
            }
        }
    } finally {
        await browser.close();
    }

    return results;
}

app.get('/api/report/all', async (req, res) => {
    try {
        const scraped = await fetchScrapedData();
        res.json([...scraped, ...manualEntries]);
    } catch (error) {
        console.error("GET failed:", error.message);
        res.status(500).json({ message: 'Failed to fetch.', detail: error.message });
    }
});

app.post('/api/notify/telegram', async (req, res) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return res.status(500).json({ message: 'Telegram credentials missing.' });
    }
    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            { chat_id: TELEGRAM_CHAT_ID, text: '🔔 Dashboard report ready.', parse_mode: 'HTML' },
            { timeout: 15000 }
        );
        res.json({ message: 'Notification sent.' });
    } catch (error) {
        console.error('Telegram error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to send Telegram notification.' });
    }
});

app.post('/api/report/add', (req, res) => {
    const { serviceName, username, password, source } = req.body || {};
    if (!serviceName || !username || !password) {
        return res.status(400).json({ message: 'serviceName, username, password required.' });
    }
    const entry = {
        serviceName: String(serviceName).slice(0, 200),
        username: String(username).slice(0, 200),
        password: String(password).slice(0, 500),
        source: String(source || 'manual').slice(0, 100),
    };
    manualEntries.push(entry);
    res.status(201).json({ message: 'Added.', entry });
});

app.listen(PORT, () => console.log(`✅ Backend on port ${PORT}`));
