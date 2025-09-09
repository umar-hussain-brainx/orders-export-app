#!/usr/bin/env node

// Cron Job Initialization Script
// Run this script to start the quarterly cron jobs

import { cronService } from './app/services/cronService.js';

async function initializeCronJobs() {
  console.log('🚀 Starting Shopify Orders Export App with Cron Jobs...');
  
  try {
    // Default configuration for quarterly processing
    const defaultConfig = {
      schedule: 'quarterly',    // Every 3 months
      dataPeriod: 3,           // Process 3 months of data
      aiProvider: 'openai',
      confidenceThreshold: 0.7,
      maxBatches: 20,
      enableNotifications: true
    };

    // Initialize cron service
    await cronService.init(defaultConfig);
    
    console.log('✅ Cron jobs initialized successfully!');
    console.log('📅 Schedule: Quarterly (every 3 months on the 1st at midnight)');
    console.log('📊 Data Period: 3 months of historical data');
    console.log('🔄 Next run: 1st day of next quarter');
    
    // Display cron job status
    const status = cronService.getStatus();
    console.log('📋 Current Status:', JSON.stringify(status, null, 2));
    
    // Keep the process running
    console.log('🏃 Cron service is running... (Press Ctrl+C to stop)');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down cron service...');
      cronService.stopAll();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down cron service...');
      cronService.stopAll();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error initializing cron jobs:', error);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeCronJobs();
}

export { initializeCronJobs };
