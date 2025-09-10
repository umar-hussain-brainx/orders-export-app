# 🚀 Orders Export App - Heroku Deployment

## Quick Start

### 1. Deploy to Heroku
```bash
# Automated deployment (recommended)
./deploy-heroku.sh

# Manual deployment
heroku create your-orders-export-app
heroku addons:create heroku-postgresql:mini
heroku config:set SHOPIFY_API_KEY=your_key
heroku config:set SHOPIFY_API_SECRET=your_secret
heroku config:set WEBHOOK_SECRET=your_token
heroku config:set OPENAI_API_KEY=your_openai_key
git push heroku main
```

### 2. Set GitHub Secrets
Go to GitHub repo → Settings → Secrets and Variables → Actions

Add:
- `APP_URL`: `https://your-orders-export-app.herokuapp.com`
- `WEBHOOK_SECRET`: Your secure random token
- `SHOPIFY_SHOP_DOMAIN`: `your-shop.myshopify.com`

### 3. Test Your Setup
```bash
# Test webhook
npm run test:webhook

# Trigger manually
npm run trigger:cron

# View logs
npm run logs:heroku
```

## 📅 Quarterly Schedule

GitHub Actions automatically triggers your Heroku app:
- **January 1st** → Process Oct-Dec data
- **April 1st** → Process Jan-Mar data  
- **July 1st** → Process Apr-Jun data
- **October 1st** → Process Jul-Sep data

## 💰 Cost

**Eco Dynos ($5/month)**
- Perfect for quarterly processing
- Sleeps when not in use
- Wakes instantly when triggered

## 📁 Heroku-Specific Files

- ✅ `Procfile` - Heroku startup configuration
- ✅ `deploy-heroku.sh` - Automated deployment script
- ✅ `HEROKU_SETUP.md` - Detailed setup guide
- ✅ `.github/workflows/quarterly-cron.yml` - GitHub Actions cron
- ✅ `external-cron-trigger.js` - Manual trigger script

## 🎯 What Happens Quarterly

1. **GitHub Actions** runs on schedule
2. **Calls Heroku webhook** to wake up your app
3. **Heroku processes** configurable months of order data
4. **AI analyzes** purchase patterns
5. **Updates metaobject** with upsell recommendations
6. **App goes back to sleep** until next quarter

**Your quarterly upsell automation is ready! 🎉**
