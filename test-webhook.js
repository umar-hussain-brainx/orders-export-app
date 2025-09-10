#!/usr/bin/env node

// Test script for the cron webhook
// Run this to test your production cron setup

import fetch from 'node-fetch';

async function testWebhook() {
  console.log('🧪 Testing Cron Webhook...');
  
  // Configuration - update these values
  const config = {
    // Local development
    appUrl: 'http://localhost:3000',
    
    // Or production (uncomment and update)
    // appUrl: 'https://your-app.vercel.app',
    
    webhookSecret: process.env.WEBHOOK_SECRET || 'test-secret-token',
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || 'your-shop.myshopify.com'
  };

  console.log(`📍 Testing webhook at: ${config.appUrl}`);
  console.log(`🏪 Shop domain: ${config.shopDomain}`);

  try {
    const response = await fetch(`${config.appUrl}/webhooks/cron/trigger`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.webhookSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Webhook-Test/1.0'
      },
      body: `shop=${config.shopDomain}`
    });

    console.log(`📊 Response status: ${response.status}`);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Webhook test successful!');
      console.log('📋 Result:', JSON.stringify(result, null, 2));
    } else {
      const error = await response.text();
      console.error('❌ Webhook test failed!');
      console.error(`📋 Error: ${error}`);
    }

  } catch (error) {
    console.error('💥 Network error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Tip: Make sure your app is running with "npm run dev"');
    }
  }
}

// Helper function to show usage
function showUsage() {
  console.log(`
🧪 Webhook Test Script

Usage:
  node test-webhook.js

Environment Variables:
  WEBHOOK_SECRET     - Your webhook secret token
  SHOPIFY_SHOP_DOMAIN - Your shop domain (e.g., shop.myshopify.com)

Examples:
  # Test local development
  WEBHOOK_SECRET=test-token SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com node test-webhook.js
  
  # Test production
  # 1. Update appUrl in the script to your production URL
  # 2. Run: node test-webhook.js
`);
}

// Run test or show usage
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
} else {
  testWebhook();
}

