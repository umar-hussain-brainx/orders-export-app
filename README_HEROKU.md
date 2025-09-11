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

### 2. Add Heroku Scheduler
```bash
# Add Heroku Scheduler add-on
heroku addons:create scheduler:standard -a your-app-name

# Open scheduler dashboard
heroku addons:open scheduler -a your-app-name
```

### 3. Configure Quarterly Job
1. In Heroku Dashboard → Resources → Heroku Scheduler
2. Click "Create job"
3. Set command: `curl -X POST https://your-app-name.herokuapp.com/scheduler/process`
4. Set schedule: Every 3 months (or cron: `0 0 1 */3 *`)

### 4. Test Your Setup
```bash
# Test scheduler endpoint
curl -X POST https://your-app-name.herokuapp.com/scheduler/process

# View logs
npm run logs:heroku
```

## 📅 Quarterly Schedule

Heroku Scheduler automatically triggers your app:
- **January 1st** → Process Oct-Dec data
- **April 1st** → Process Jan-Mar data  
- **July 1st** → Process Apr-Jun data
- **October 1st** → Process Jul-Sep data

## 💰 Cost

**Standard Dynos ($25/month)**
- Required for Heroku Scheduler
- Never sleeps
- Reliable quarterly processing

## 📁 Heroku-Specific Files

- ✅ `Procfile` - Heroku startup configuration
- ✅ `deploy-heroku.sh` - Automated deployment script
- ✅ `HEROKU_SETUP.md` - Detailed setup guide
- ✅ `app/routes/scheduler.process.jsx` - Heroku Scheduler endpoint

## 🎯 What Happens Quarterly

1. **Heroku Scheduler** runs on schedule
2. **Calls /scheduler/process** endpoint
3. **Heroku processes** 3 months of order data
4. **AI analyzes** purchase patterns
5. **Updates metaobject** with upsell recommendations
6. **Process completes** until next quarter

**Your quarterly upsell automation is ready! 🎉**
