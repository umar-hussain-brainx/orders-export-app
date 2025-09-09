// Cron Job Service for Automated Order Export and AI Processing
import cron from 'node-cron';
import { authenticate } from '../shopify.server.js';

class CronService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  // Initialize cron jobs with configurable schedule
  async init(config = null) {
    if (this.isInitialized) return;
    
    console.log('🚀 Initializing Cron Service...');
    
    // Load configuration if not provided
    if (!config) {
      try {
        // This would load from the saved configuration
        config = await this.loadSavedConfiguration();
      } catch (error) {
        console.warn('⚠️ Could not load saved config, using defaults');
        config = { schedule: 'quarterly', dataPeriod: 3 }; // Default to quarterly with 3 months data
      }
    }
    
    // Get cron pattern based on schedule
    const cronPattern = this.getCronPattern(config.schedule || 'quarterly');
    
    // Schedule order export and AI processing
    this.scheduleOrderExport(cronPattern, config);
    
    // Schedule summary (1 hour after main processing)
    const summaryCronPattern = this.getCronPattern(config.schedule || 'quarterly', 1);
    this.scheduleMonthlySummary(summaryCronPattern, config);
    
    this.isInitialized = true;
    console.log(`✅ Cron Service initialized with ${config.schedule || 'quarterly'} schedule`);
  }

  // Get cron pattern based on schedule type
  getCronPattern(schedule, hourOffset = 0) {
    const hour = hourOffset;
    
    switch (schedule) {
      case 'weekly':
        return `0 ${hour} * * 0`; // Every Sunday at specified hour
      case 'monthly':
        return `0 ${hour} 1 * *`; // 1st of every month at specified hour
      case 'quarterly':
        return `0 ${hour} 1 */3 *`; // 1st day of every 3rd month at specified hour
      case 'biannually':
        return `0 ${hour} 1 */6 *`; // 1st day of every 6th month at specified hour
      case 'yearly':
        return `0 ${hour} 1 1 *`; // January 1st at specified hour
      default:
        return `0 ${hour} 1 */3 *`; // Default to quarterly
    }
  }

  // Load saved configuration (placeholder - would integrate with your config system)
  async loadSavedConfiguration() {
    // This would be implemented to load from your configuration system
    // For now, return default quarterly configuration
    return {
      schedule: 'quarterly',
      dataPeriod: 3,
      enableNotifications: true
    };
  }

  // Schedule order export and AI processing
  scheduleOrderExport(cronPattern, config) {
    const job = cron.schedule(cronPattern, async () => {
      console.log(`📅 Running ${config.schedule || 'quarterly'} order export and AI processing...`);
      
      try {
        // Get orders from configured data period
        const endDate = new Date();
        const dataPeriodMonths = config.dataPeriod || 3;
        const startDate = new Date(endDate.getTime() - (dataPeriodMonths * 30 * 24 * 60 * 60 * 1000)); // configurable months ago
        
        console.log(`📊 Processing ${dataPeriodMonths} months of data (${startDate.toDateString()} to ${endDate.toDateString()})`);
        
        const orders = await this.exportOrdersForPeriod(startDate, endDate);
        
        if (orders.length > 0) {
          console.log(`📦 Found ${orders.length} new orders`);
          
          // Send to AI for processing
          const aiResults = await this.processOrdersWithAI(orders);
          
          // Store results in metaobjects
          await this.storeAIResultsInMetaobjects(aiResults);
          
          console.log('✅ Order processing completed successfully');
        } else {
          console.log('📭 No new orders found');
        }
      } catch (error) {
        console.error('❌ Error in scheduled order processing:', error);
      }
    }, {
      scheduled: false,
      timezone: "UTC"
    });

    this.jobs.set('orderExport', job);
    job.start();
    console.log(`⏰ Monthly order export scheduled with pattern: ${cronPattern}`);
  }

  // Schedule summary
  scheduleMonthlySummary(cronPattern, config) {
    const job = cron.schedule(cronPattern, async () => {
      console.log(`📊 Running ${config.schedule || 'quarterly'} summary...`);
      
      try {
        // Get data from configured period
        const endDate = new Date();
        const dataPeriodMonths = config.dataPeriod || 3;
        const startDate = new Date(endDate.getTime() - (dataPeriodMonths * 30 * 24 * 60 * 60 * 1000)); // configurable months ago
        
        const orders = await this.exportOrdersForPeriod(startDate, endDate);
        const summary = await this.generateSummary(orders, config);
        
        // Store monthly summary
        await this.storeMonthlySummary(summary);
        
        console.log('✅ Monthly summary completed');
      } catch (error) {
        console.error('❌ Error in monthly summary:', error);
      }
    }, {
      scheduled: false,
      timezone: "UTC"
    });

    this.jobs.set('monthlySummary', job);
    job.start();
    console.log(`📊 Monthly summary scheduled with pattern: ${cronPattern}`);
  }

  // Export orders for a specific time period
  async exportOrdersForPeriod(startDate, endDate) {
    try {
      // This would need a shop context - we'll handle this in the route
      // For now, return mock data structure
      console.log(`📅 Exporting orders from ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // This will be implemented with actual Shopify API calls
      return [];
    } catch (error) {
      console.error('❌ Error exporting orders:', error);
      throw error;
    }
  }

  // Process orders with AI
  async processOrdersWithAI(orders) {
    try {
      console.log('🤖 Processing orders with AI...');
      
      // Prepare data for AI
      const orderData = this.prepareOrderDataForAI(orders);
      
      // Call AI service (OpenAI, Claude, etc.)
      const aiResponse = await this.callAIService(orderData);
      
      return aiResponse;
    } catch (error) {
      console.error('❌ Error processing with AI:', error);
      throw error;
    }
  }

  // Prepare order data for AI processing
  prepareOrderDataForAI(orders) {
    return orders.map(order => ({
      order_id: order.order_id,
      customer_id: order.customer_id,
      products: order.line_items.map(item => ({
        product_id: item.product_id,
        product_title: item.product_title,
        variant_id: item.variant_id,
        variant_title: item.variant_title,
        quantity: item.quantity,
        price: item.unit_price
      })),
      total_price: order.total_price,
      created_at: order.created_at
    }));
  }

  // Call AI service to create product pairs/recommendations
  async callAIService(orderData) {
    try {
      // Example using OpenAI API
      const prompt = this.createAIPrompt(orderData);
      
      // This would call your preferred AI service
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert e-commerce analyst. Analyze order data and create product pairs/recommendations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.7
        })
      });

      const aiResult = await response.json();
      return this.parseAIResponse(aiResult);
    } catch (error) {
      console.error('❌ Error calling AI service:', error);
      throw error;
    }
  }

  // Create AI prompt from order data
  createAIPrompt(orderData) {
    const ordersText = orderData.map(order => 
      `Order ${order.order_id}: ${order.products.map(p => p.product_title).join(', ')}`
    ).join('\n');

    return `
Analyze the following order data and create product pairs/recommendations:

${ordersText}

Please return a JSON response with:
1. Frequently bought together pairs
2. Recommended products for each customer segment
3. Cross-sell opportunities
4. Upsell suggestions

Format the response as valid JSON with clear categories and product IDs.
`;
  }

  // Parse AI response
  parseAIResponse(aiResult) {
    try {
      const content = aiResult.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      console.error('❌ Error parsing AI response:', error);
      return {
        pairs: [],
        recommendations: [],
        cross_sell: [],
        upsell: []
      };
    }
  }

  // Store AI results in Shopify metaobjects
  async storeAIResultsInMetaobjects(aiResults) {
    try {
      console.log('💾 Storing AI results in metaobjects...');
      
      // This will be implemented with Shopify Admin API
      // For now, just log the results
      console.log('AI Results:', JSON.stringify(aiResults, null, 2));
      
      return true;
    } catch (error) {
      console.error('❌ Error storing in metaobjects:', error);
      throw error;
    }
  }

  // Generate summary for configured period
  async generateSummary(orders, config) {
    const dataPeriodMonths = config.dataPeriod || 3;
    const periodLabel = this.getPeriodLabel(config.schedule || 'quarterly', dataPeriodMonths);
    
    const summary = {
      date: new Date().toISOString().split('T')[0],
      period: periodLabel,
      schedule: config.schedule || 'quarterly',
      data_period_months: dataPeriodMonths,
      total_orders: orders.length,
      total_revenue: orders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0),
      unique_customers: new Set(orders.map(order => order.customer_id)).size,
      top_products: this.getTopProducts(orders),
      average_order_value: orders.length > 0 ? orders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0) / orders.length : 0,
      created_at: new Date().toISOString()
    };

    return summary;
  }

  // Get period label based on schedule and data period
  getPeriodLabel(schedule, dataPeriodMonths) {
    if (dataPeriodMonths === 1) return '1_month';
    if (dataPeriodMonths === 3) return '3_months';
    if (dataPeriodMonths === 6) return '6_months';
    if (dataPeriodMonths === 12) return '1_year';
    return `${dataPeriodMonths}_months`;
  }

  // Get top products from orders
  getTopProducts(orders) {
    const productCounts = {};
    
    orders.forEach(order => {
      order.line_items?.forEach(item => {
        const key = `${item.product_id}-${item.product_title}`;
        productCounts[key] = (productCounts[key] || 0) + item.quantity;
      });
    });

    return Object.entries(productCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([product, quantity]) => {
        const [product_id, product_title] = product.split('-');
        return { product_id, product_title, quantity };
      });
  }

  // Store monthly summary
  async storeMonthlySummary(summary) {
    try {
      console.log('📊 Monthly Summary:', JSON.stringify(summary, null, 2));
      // This would update the existing metaobject with monthly summary data
      return true;
    } catch (error) {
      console.error('❌ Error storing monthly summary:', error);
      throw error;
    }
  }

  // Restart cron jobs with new configuration
  async restart(config) {
    console.log('🔄 Restarting cron jobs with new configuration...');
    this.stopAll();
    await this.init(config);
  }

  // Stop all cron jobs
  stopAll() {
    console.log('⏹️ Stopping all cron jobs...');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`⏹️ Stopped job: ${name}`);
    });
    this.jobs.clear();
    this.isInitialized = false;
  }

  // Get job status
  getStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.running,
        scheduled: job.scheduled
      };
    });
    return status;
  }
}

// Export singleton instance
export const cronService = new CronService();
export default cronService;
