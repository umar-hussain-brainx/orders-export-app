#!/bin/bash

# Heroku Deployment Script
# Make this file executable: chmod +x deploy-heroku.sh

echo "🚀 Deploying Orders Export App to Heroku..."

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI not found. Please install it first:"
    echo "   brew tap heroku/brew && brew install heroku"
    exit 1
fi

# Login to Heroku (if not already logged in)
echo "🔐 Checking Heroku authentication..."
if ! heroku auth:whoami &> /dev/null; then
    echo "Please login to Heroku:"
    heroku login
fi

# Get app name from user
read -p "Enter your Heroku app name (e.g., my-orders-export-app): " APP_NAME

if [ -z "$APP_NAME" ]; then
    echo "❌ App name is required"
    exit 1
fi

# Create Heroku app
echo "🏗️  Creating Heroku app: $APP_NAME"
heroku create $APP_NAME --region us

# Add Postgres database
echo "🗄️  Adding Postgres database..."
heroku addons:create heroku-postgresql:mini -a $APP_NAME

# Set environment variables
echo "⚙️  Setting environment variables..."
echo "Please provide the following environment variables:"

read -p "SHOPIFY_API_KEY: " SHOPIFY_API_KEY
read -p "SHOPIFY_API_SECRET: " SHOPIFY_API_SECRET
read -p "WEBHOOK_SECRET (generate a random token): " WEBHOOK_SECRET
read -p "OPENAI_API_KEY: " OPENAI_API_KEY

heroku config:set SHOPIFY_API_KEY="$SHOPIFY_API_KEY" -a $APP_NAME
heroku config:set SHOPIFY_API_SECRET="$SHOPIFY_API_SECRET" -a $APP_NAME
heroku config:set WEBHOOK_SECRET="$WEBHOOK_SECRET" -a $APP_NAME
heroku config:set OPENAI_API_KEY="$OPENAI_API_KEY" -a $APP_NAME

# Deploy the app
echo "🚀 Deploying to Heroku..."
git add .
git commit -m "Deploy to Heroku: $APP_NAME"
git push heroku main

# Open the app
echo "🎉 Deployment complete!"
echo "📱 Opening your app..."
heroku open -a $APP_NAME

# Show next steps
echo ""
echo "✅ Next Steps:"
echo "1. Go to GitHub repo → Settings → Secrets and Variables → Actions"
echo "2. Add these secrets:"
echo "   - APP_URL: https://$APP_NAME.herokuapp.com"
echo "   - WEBHOOK_SECRET: $WEBHOOK_SECRET"
echo "   - SHOPIFY_SHOP_DOMAIN: your-shop.myshopify.com"
echo "3. Test with: npm run trigger:cron"
echo "4. Your quarterly cron job will run automatically via GitHub Actions!"

echo ""
echo "🔗 Useful commands:"
echo "   heroku logs --tail -a $APP_NAME"
echo "   heroku config -a $APP_NAME"
echo "   heroku ps -a $APP_NAME"
