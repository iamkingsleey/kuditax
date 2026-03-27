# Skill: Hosting Guide (Free Tier — Test Phase)

## Context
Railway free tier is exhausted. This guide covers the best free hosting options for running the Kuditax WhatsApp bot during development and testing. All options below support Node.js and are suitable for a WhatsApp webhook server.

---

## Recommended Option: Render

**Why Render?**
- Free tier includes a persistent web service (not serverless)
- HTTPS out of the box — required by Meta for webhook verification
- Auto-deploys from GitHub on every push
- Environment variables managed in dashboard
- Simple to set up — no CLI required to get started

**Limitation:** The free tier web service sleeps after 15 minutes of inactivity. Cold start takes ~30–50 seconds. For a testing bot this is acceptable. For production, upgrade to Render's paid tier ($7/month).

**Cold Start Fix for Testing:**
Use [UptimeRobot](https://uptimerobot.com) (free) to ping your Render URL every 14 minutes. This keeps the server awake during active testing periods.

```
UptimeRobot Monitor:
  Type: HTTP(s)
  URL: https://your-kuditax-app.onrender.com/health
  Interval: Every 14 minutes
```

Add a health check endpoint to your server:

```js
// Health check endpoint — used by UptimeRobot to keep server alive on free tier
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'kuditax', timestamp: new Date().toISOString() });
});
```

### Render Deployment Steps

1. Push your code to a GitHub repository
2. Go to https://render.com and create an account
3. Click **New → Web Service**
4. Connect your GitHub repo
5. Set:
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `node src/index.js`
   - Instance Type: Free
6. Add environment variables from your `.env` in the Render dashboard
7. Deploy — Render gives you a URL like `https://kuditax.onrender.com`
8. Use this URL as your Meta webhook: `https://kuditax.onrender.com/webhook`

---

## Alternative Option: Fly.io

**Why Fly.io?**
- Free tier machines do NOT sleep (unlike Render free tier)
- More reliable for webhook delivery during testing
- Requires CLI setup (slightly more technical than Render)
- Free allowance: 3 shared-cpu-1x VMs, 256MB RAM each

**Best for:** If the Render cold start causes issues with Meta webhook verification.

### Fly.io Deployment Steps

```bash
# Install Fly CLI
brew install flyctl       # macOS
# or
curl -L https://fly.io/install.sh | sh   # Linux

# Login
flyctl auth login

# From your project root
flyctl launch            # Detects Node.js, creates fly.toml
flyctl secrets set WHATSAPP_ACCESS_TOKEN=your_token_here
flyctl secrets set ANTHROPIC_API_KEY=your_key_here
flyctl secrets set WHATSAPP_VERIFY_TOKEN=your_verify_token
flyctl deploy
```

---

## Alternative Option: Koyeb

**Why Koyeb?**
- Free tier does not sleep
- Supports Docker and GitHub deployments
- Automatic HTTPS
- Simple dashboard

Deploy from GitHub in the same way as Render. Free tier gives you 1 web service with 512MB RAM.

---

## Option Comparison

| Feature | Render (Free) | Fly.io (Free) | Koyeb (Free) |
|---|---|---|---|
| Sleeps on inactivity | Yes (15 min) | No | No |
| HTTPS included | Yes | Yes | Yes |
| GitHub auto-deploy | Yes | Yes | Yes |
| Ease of setup | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| RAM | 512MB | 256MB | 512MB |
| Best for | Quick start | Reliability | Balance |

---

## Environment Variable Checklist

Before deploying to any platform, ensure all these are set in the platform's environment variable dashboard. Never commit `.env` to GitHub.

```
PORT=3000
NODE_ENV=production
WHATSAPP_PHONE_NUMBER_ID=        # From Meta Developer Console
WHATSAPP_ACCESS_TOKEN=           # Temporary token from Meta (expires — refresh regularly)
WHATSAPP_VERIFY_TOKEN=           # A random string you choose for webhook verification
ANTHROPIC_API_KEY=               # From console.anthropic.com
```

---

## Meta Webhook Configuration

After deploying, configure Meta to send WhatsApp messages to your server:

1. Go to https://developers.facebook.com → Your App → WhatsApp → Configuration
2. Set **Webhook URL**: `https://your-app-url.onrender.com/webhook`
3. Set **Verify Token**: The same value as your `WHATSAPP_VERIFY_TOKEN` env var
4. Subscribe to webhook fields: `messages`
5. Click Verify and Save — Meta will send a GET request to your webhook URL to confirm it's live

Your webhook verification handler must respond correctly:

```js
// Meta webhook verification — GET /webhook
// Meta sends hub.challenge and hub.verify_token as query params
// We must return hub.challenge if the token matches
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook verified successfully');
    return res.status(200).send(challenge); // Must return the challenge as plain text
  }

  logger.warn('Webhook verification failed — token mismatch');
  return res.status(403).send('Forbidden');
});
```

---

## When to Move Off Free Tier

Move to a paid tier when:
- You have more than 5 concurrent test users
- You need guaranteed uptime (no cold starts)
- You're onboarding real users (not just testers)
- Render free tier logs show memory pressure

**Recommended paid progression:**
1. Render Starter ($7/month) → handles up to ~100 concurrent sessions
2. Render Standard ($25/month) + Redis ($7/month) → production-grade with persistent sessions

---

## .gitignore (Required Before First Push)

Ensure this is in your `.gitignore` before pushing to GitHub:

```
# Dependencies
node_modules/

# Environment variables — NEVER commit these
.env
.env.local
.env.production

# Logs
*.log
logs/

# OS files
.DS_Store
Thumbs.db

# Build artifacts
dist/
build/
```
