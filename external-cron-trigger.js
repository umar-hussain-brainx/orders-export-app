#!/usr/bin/env node

// External Cron Trigger Script
// This can be run from any server, VPS, or cloud function
// Use this with crontab, AWS Lambda, Google Cloud Functions, etc.

import fetch from 'node-fetch';

async function triggerShopifyAppCron() {
  console.log('🚀 Triggering Shopify App Cron Job...');
  
  const config = {
    // Your deployed app URL (update for your platform)
    appUrl: process.env.APP_URL || 'https://your-orders-export-app.herokuapp.com', // Heroku
    // appUrl: process.env.APP_URL || 'https://your-app.vercel.app', // Vercel
    // appUrl: process.env.APP_URL || 'https://your-app.railway.app', // Railway
    
    // Webhook secret for authentication
    webhookSecret: process.env.WEBHOOK_SECRET || 'your-secret-token',
    
    // Your Shopify shop domain
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || 'your-shop.myshopify.com'
  };

  try {
    const response = await fetch(`${config.appUrl}/webhooks/cron/trigger`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.webhookSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'External-Cron-Trigger/1.0'
      },
      body: `shop=${config.shopDomain}`
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Cron job triggered successfully:', result);
      return { success: true, result };
    } else {
      const error = await response.text();
      console.error('❌ Cron job failed:', response.status, error);
      return { success: false, error: `HTTP ${response.status}: ${error}` };
    }

  } catch (error) {
    console.error('❌ Network error:', error.message);
    return { success: false, error: error.message };
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  triggerShopifyAppCron()
    .then(result => {
      if (result.success) {
        console.log('🎉 Quarterly processing completed!');
        process.exit(0);
      } else {
        console.error('💥 Quarterly processing failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

export { triggerShopifyAppCron };
