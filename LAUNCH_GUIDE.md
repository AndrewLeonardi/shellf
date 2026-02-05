# Shellf Launch Guide

## Table of Contents
1. [Local Development Testing](#local-development-testing)
2. [Testing with OpenClaw AI Bot](#testing-with-openclaw-ai-bot)
3. [Deploying to Render](#deploying-to-render)
4. [Post-Deployment Configuration](#post-deployment-configuration)
5. [Troubleshooting](#troubleshooting)

---

## Local Development Testing

### Prerequisites
- Node.js 18+ installed
- PostgreSQL running locally (or use a cloud database)

### Step 1: Environment Setup

Create a `.env` file in the project root:

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/shellf?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-development-secret-key-min-32-chars"

# Stripe (Test Mode)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# Stripe Price IDs (Test Mode)
STRIPE_PRICE_STARTER="price_..."
STRIPE_PRICE_PRO="price_..."
STRIPE_PRICE_AGENCY="price_..."
```

### Step 2: Database Setup

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# (Optional) View database in Prisma Studio
npx prisma studio
```

### Step 3: Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see your app.

### Step 4: Test Stripe Webhooks Locally

Install Stripe CLI: https://stripe.com/docs/stripe-cli

```bash
# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# This will output a webhook signing secret (whsec_...)
# Update STRIPE_WEBHOOK_SECRET in your .env file with this value
```

---

## Testing with OpenClaw AI Bot

### How the Integration Works

OpenClaw will use Shellf's API to:
1. Authenticate users via email lookup
2. Check subscription status and credits
3. Deduct credits when users interact

### API Endpoints for OpenClaw

**Base URL:** `https://your-domain.com/api`

#### 1. Get User by Email
```
GET /api/user?email={email}
```

Response:
```json
{
  "id": "user_id",
  "email": "user@example.com",
  "name": "User Name",
  "plan": "pro",
  "credits": 500,
  "stripeCustomerId": "cus_..."
}
```

#### 2. Check Credits
```
GET /api/credits?email={email}
```

Response:
```json
{
  "credits": 500,
  "plan": "pro"
}
```

#### 3. Use Credits
```
POST /api/credits/use
Content-Type: application/json

{
  "email": "user@example.com",
  "amount": 1
}
```

Response:
```json
{
  "success": true,
  "remainingCredits": 499
}
```

### Testing Flow

1. **Create a test user manually:**
   ```bash
   npx prisma studio
   ```
   Add a user with email, credits, and plan.

2. **Test API endpoints:**
   ```bash
   # Check user
   curl http://localhost:3000/api/user?email=test@example.com

   # Check credits
   curl http://localhost:3000/api/credits?email=test@example.com

   # Use credits
   curl -X POST http://localhost:3000/api/credits/use \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","amount":1}'
   ```

3. **Configure OpenClaw:**
   - Point OpenClaw's user lookup to your Shellf API
   - Before processing a request, OpenClaw should:
     1. Call `/api/user?email={email}` to get user info
     2. Call `/api/credits?email={email}` to check credits
     3. If credits > 0, process the request
     4. Call `/api/credits/use` to deduct credits after completion

---

## Deploying to Render

### Step 1: Prepare Your Repository

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. Make sure these files exist:
   - `package.json` with build scripts
   - `prisma/schema.prisma`
   - `next.config.ts`

### Step 2: Create Render PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **PostgreSQL**
3. Configure:
   - **Name:** `shellf-db`
   - **Region:** Choose closest to your users
   - **PostgreSQL Version:** 15
   - **Plan:** Free (for testing) or Starter ($7/mo for production)
4. Click **Create Database**
5. Copy the **Internal Database URL** (starts with `postgres://`)

### Step 3: Create Render Web Service

1. Click **New** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `shellf`
   - **Region:** Same as database
   - **Branch:** `main`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free (for testing) or Starter ($7/mo for production)

### Step 4: Add Environment Variables

In Render Web Service settings, add these environment variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Internal Database URL from Step 2 |
| `NEXTAUTH_URL` | `https://shellf.onrender.com` (your Render URL) |
| `NEXTAUTH_SECRET` | Generate with: `openssl rand -base64 32` |
| `STRIPE_SECRET_KEY` | Your Stripe secret key (use live key for production) |
| `STRIPE_WEBHOOK_SECRET` | Webhook secret from Stripe dashboard |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key |
| `STRIPE_PRICE_STARTER` | Price ID for Starter plan |
| `STRIPE_PRICE_PRO` | Price ID for Pro plan |
| `STRIPE_PRICE_AGENCY` | Price ID for Agency plan |

### Step 5: Deploy

1. Click **Create Web Service**
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Generate Prisma client
   - Build the Next.js app
   - Start the server

3. First deployment takes ~5-10 minutes

### Step 6: Initialize Database Schema

After first deployment, run database migrations:

**Option A: Using Render Shell**
1. Go to your Web Service → Shell
2. Run: `npx prisma db push`

**Option B: Add to Build Command**
Update build command to:
```
npm install && npx prisma generate && npx prisma db push && npm run build
```

---

## Post-Deployment Configuration

### 1. Configure Stripe Webhooks

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Configure:
   - **Endpoint URL:** `https://your-app.onrender.com/api/webhooks/stripe`
   - **Events to send:**
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
4. Copy the **Signing secret** and update `STRIPE_WEBHOOK_SECRET` in Render

### 2. Set Up Custom Domain (Optional)

1. In Render dashboard, go to your Web Service → Settings → Custom Domains
2. Add your domain (e.g., `app.shellf.com`)
3. Configure DNS:
   - Add CNAME record pointing to your Render URL
4. Update `NEXTAUTH_URL` environment variable to your custom domain
5. Update Stripe webhook endpoint URL

### 3. Configure OpenClaw for Production

Update OpenClaw to use your production Shellf URL:
- API Base URL: `https://your-app.onrender.com/api`

### 4. Test Everything

1. **Test signup flow:**
   - Visit your site
   - Click on a pricing plan
   - Complete Stripe checkout (use test card: 4242 4242 4242 4242)
   - Verify user is created with correct plan and credits

2. **Test credit usage:**
   - Use the API endpoints to verify credits work

3. **Test webhook:**
   - In Stripe dashboard, send a test webhook event
   - Check your app logs for webhook processing

---

## Troubleshooting

### Common Issues

#### "Database connection failed"
- Verify `DATABASE_URL` is correct
- Ensure database is running
- Check if IP whitelist is needed (shouldn't be for Render internal URLs)

#### "Invalid NEXTAUTH_URL"
- Must match your actual deployment URL exactly
- Include `https://` for production
- No trailing slash

#### "Stripe webhook signature verification failed"
- Ensure `STRIPE_WEBHOOK_SECRET` matches the webhook endpoint
- Check that you're using the correct secret (test vs live)

#### "Prisma Client not generated"
- Add `npx prisma generate` to build command
- Ensure `@prisma/client` is in dependencies (not devDependencies)

#### Build fails with memory error
- Upgrade to a paid Render plan with more memory
- Or add to build command: `NODE_OPTIONS=--max_old_space_size=4096`

### Viewing Logs

**Render:**
- Go to Web Service → Logs
- Filter by time range or search

**Local:**
```bash
npm run dev
# Logs appear in terminal
```

### Testing Stripe Integration

```bash
# Test webhook locally
stripe trigger checkout.session.completed

# Test specific events
stripe trigger customer.subscription.updated
stripe trigger invoice.paid
```

---

## Quick Reference

### Local Development
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
# In another terminal: stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Production Checklist
- [ ] Database created and connected
- [ ] All environment variables set
- [ ] Prisma schema pushed to production database
- [ ] Stripe webhooks configured for production URL
- [ ] Stripe using live keys (not test keys)
- [ ] NEXTAUTH_URL matches production domain
- [ ] Custom domain configured (if using)
- [ ] OpenClaw configured with production API URL

### API Quick Reference
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/user?email=...` | GET | Get user by email |
| `/api/credits?email=...` | GET | Check user credits |
| `/api/credits/use` | POST | Deduct credits |
| `/api/webhooks/stripe` | POST | Stripe webhook handler |

---

## Support

If you run into issues:
1. Check the logs in Render dashboard
2. Verify all environment variables are set correctly
3. Test Stripe webhooks are being received
4. Ensure database migrations are applied
