# 🔧 Troubleshooting Guide - Orders Export App

## 🚨 Common Issues & Solutions

### 1. **App Won't Start**

#### Missing .env File
```bash
# Create .env file in orders-export-app directory
touch .env

# Add these required variables:
SHOPIFY_API_KEY=accd8fd895867b20703cbc0ec49019c0
SHOPIFY_API_SECRET=your_shopify_api_secret_here
DATABASE_URL="file:./dev.sqlite"
WEBHOOK_SECRET=your_webhook_secret_here
```

#### Fix: Run Setup Commands
```bash
cd orders-export-app
npm install
npm run dev
```

### 2. **"This app is not approved to access the Order object" Error**

#### Solution: Update App Scopes
1. **Check `shopify.app.toml`** - should have:
   ```toml
   scopes = "write_products,read_products,read_orders,read_all_orders,read_customers,write_metaobjects,read_metaobjects"
   ```

2. **Reinstall App** (if scopes changed):
   ```bash
   shopify app uninstall
   shopify app install
   ```

### 3. **AI Integration Not Working**

#### Missing API Keys
Add to your `.env` file:
```bash
OPENAI_API_KEY=sk-your-openai-key-here
# OR
CLAUDE_API_KEY=your-claude-key-here
```

#### Test AI Connection
1. Go to **AI Automation** tab
2. Click **"Test AI Integration"**
3. Check for error messages

### 4. **Metaobjects Not Creating**

#### Solution: Create Metaobject Definition
1. Go to **AI Automation > Setup** tab
2. Click **"Create AI Analysis Metaobject"**
3. Check Shopify Admin > Settings > Custom Data

### 5. **Orders Export Failing**

#### Check Access Permissions
```bash
# In app console, check if you can access orders:
query {
  orders(first: 1) {
    edges {
      node {
        id
        name
      }
    }
  }
}
```

### 6. **Automation Not Running**

#### Manual Test First
1. Go to **AI Automation** tab
2. Click **"Run Manual Processing"**
3. Check console logs for errors

#### Cron Job Setup
```bash
# Add to crontab (crontab -e)
0 2 1 * * curl -X POST https://your-app.com/api/automation -d "action=processOrders" -H "Authorization: Bearer YOUR_WEBHOOK_SECRET"
```

## 🛠 Quick Diagnostic Commands

### Check App Status
```bash
cd orders-export-app
npm run build  # Should complete without errors
npm run dev    # Should start on port 3000
```

### Test Database Connection
```bash
npx prisma db push
npx prisma studio  # Opens database viewer
```

### Check Shopify CLI
```bash
shopify version
shopify app info  # Shows current app details
```

## 📋 Step-by-Step Recovery

### If Nothing Works, Start Fresh:

1. **Stop all processes**
   ```bash
   # Kill any running processes
   pkill -f "npm run dev"
   ```

2. **Clean install**
   ```bash
   cd orders-export-app
   rm -rf node_modules
   rm package-lock.json
   npm install
   ```

3. **Reset database**
   ```bash
   rm prisma/dev.sqlite
   npx prisma db push
   ```

4. **Create .env file** (manually)
   ```bash
   # Create and edit .env with required variables
   ```

5. **Test basic functionality**
   ```bash
   npm run dev
   # Visit: http://localhost:3000
   ```

6. **Reinstall in Shopify**
   ```bash
   shopify app install
   ```

## 🔍 Debugging Tips

### Check Console Logs
- **Browser Console**: F12 > Console tab
- **Server Logs**: Terminal where `npm run dev` is running
- **Shopify Admin**: Apps > Your App > View logs

### Test Individual Features
1. **Basic App**: Can you see the homepage?
2. **Orders Export**: Does manual export work?
3. **AI Integration**: Does test AI call work?
4. **Metaobjects**: Can you create the definition?

### Common Error Messages & Fixes

| Error | Solution |
|-------|----------|
| "Module not found" | `npm install` |
| "Database locked" | Stop all processes, restart |
| "Invalid API key" | Check .env file |
| "GraphQL error" | Check app scopes |
| "Network error" | Check internet/ngrok |

## 📞 Still Not Working?

### Provide This Info:
1. **Error messages** (exact text)
2. **Console logs** (browser & terminal)
3. **What you were trying to do**
4. **Your environment** (OS, Node version, etc.)

### Quick Commands to Get Info:
```bash
node --version
npm --version
shopify version
cat shopify.app.toml | grep scopes
ls -la .env
```

This will help identify the specific issue! 🚀
