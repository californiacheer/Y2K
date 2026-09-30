// Reads the "Latest Updates" feed straight out of index.html, finds anything
// tagged "deadline" that falls due within REMINDER_DAYS, and sends a push for
// each one it hasn't already sent (tracked in .deadline-reminders-sent.json).
const fs = require('fs');
const https = require('https');

const REMINDER_DAYS = parseInt(process.env.REMINDER_DAYS || '3', 10);
const APP_URL = process.env.APP_URL;
const APP_ID = process.env.ONESIGNAL_APP_ID;
const API_KEY = process.env.ONESIGNAL_API_KEY;
const STATE_FILE = '.deadline-reminders-sent.json';

const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/const feed = (\[[\s\S]*?\n\];)/);
if (!match) {
  console.log('Could not find the feed array in index.html — skipping this run.');
  process.exit(0);
}

// The feed array is plain JS (not strict JSON), so evaluate it directly —
// it's content we author ourselves, running only in this throwaway runner.
// eslint-disable-next-line no-eval
const feed = eval('(' + match[1].slice(0, -1) + ')');

let sent = [];
try {
  sent = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch (e) {
  sent = [];
}

const today = new Date();
today.setHours(0, 0, 0, 0);

const toSend = [];
for (const item of feed) {
  if (item.tag !== 'deadline' || !item.expires) continue;
  const due = new Date(item.expires + 'T00:00:00');
  const daysUntil = Math.round((due - today) / 86400000);
  const key = item.title + '|' + item.expires;
  if (daysUntil >= 0 && daysUntil <= REMINDER_DAYS && !sent.includes(key)) {
    toSend.push({ item, daysUntil, key });
  }
}

if (toSend.length === 0) {
  console.log('No new deadline reminders to send today.');
  process.exit(0);
}

function sendPush(title, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      app_id: APP_ID,
      included_segments: ['Subscribed Users'],
      headings: { en: title },
      contents: { en: body },
      url: APP_URL
    });
    const req = https.request(
      'https://onesignal.com/api/v1/notifications',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${API_KEY}`
        }
      },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  for (const { item, daysUntil, key } of toSend) {
    const whenText =
      daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
    await sendPush('⏰ Deadline ' + whenText, item.title);
    sent.push(key);
    console.log('Sent reminder:', item.title);
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(sent, null, 2));
})();
