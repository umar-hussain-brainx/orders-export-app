import { json } from "@remix-run/node";

// Webhook handler for orders/create - triggers quarterly processing check
export async function action({ request }) {
  console.log("🛒 Order created webhook received");
  
  try {
    // Parse the webhook payload
    const payload = await request.json();
    const order = payload;
    
    console.log(`📦 Order ID: ${order.id}, Shop: ${order.shop_domain || 'unknown'}`);
    console.log(`📅 Order created at: ${order.created_at}`);
    
    // Extract shop domain and order creation date
    const shopDomain = order.shop_domain || extractShopFromHeaders(request);
    const orderCreatedAt = new Date(order.created_at);
    
    if (!shopDomain) {
      console.error("❌ Could not determine shop domain from webhook");
      return json({ success: false, error: "Shop domain not found" }, { status: 400 });
    }
    
    // Check if quarterly processing is due based on order creation date
    const shouldProcess = await isQuarterlyProcessingDue(shopDomain, orderCreatedAt);
    
    if (!shouldProcess.due) {
      console.log(`⏭️ Quarterly processing not due for ${shopDomain}. ${shouldProcess.message}`);
      return json({
        success: true,
        shop: shopDomain,
        message: shouldProcess.message,
        nextProcessingDate: shouldProcess.nextDate,
        skipped: true
      });
    }
    
    console.log(`✅ Quarterly processing triggered by order for ${shopDomain}!`);
    
    // Process orders using direct API calls (no Shopify auth middleware)
    const result = await processOrdersWithDirectAPI(shopDomain);
    
    // Update last processing date
    await updateLastProcessingDate(shopDomain);
    
    console.log(`✅ Quarterly processing completed for ${shopDomain}`);
    
    return json({
      success: true,
      shop: shopDomain,
      message: `Quarterly processing completed for ${shopDomain}`,
      result: result,
      processedAt: new Date().toISOString(),
      triggeredBy: `order_${order.id}`
    });
    
  } catch (error) {
    console.error("❌ Webhook processing failed:", error);
    
    return json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

// Extract shop domain from webhook headers
function extractShopFromHeaders(request) {
  const shopifyShopDomain = request.headers.get('x-shopify-shop-domain');
  const shopifyTopic = request.headers.get('x-shopify-topic');
  
  console.log(`🔍 Headers - Shop: ${shopifyShopDomain}, Topic: ${shopifyTopic}`);
  
  return shopifyShopDomain;
}

// Check if quarterly processing is due based on order creation date
async function isQuarterlyProcessingDue(shopDomain, orderDate) {
  try {
    const currentMonth = orderDate.getMonth(); // 0-11
    const currentYear = orderDate.getFullYear();
    
    // Quarterly months: January (0), April (3), July (6), October (9)
    const quarterlyMonths = [0, 3, 6, 9];
    const isQuarterlyMonth = quarterlyMonths.includes(currentMonth);
    
    if (!isQuarterlyMonth) {
      const nextQuarterlyMonth = quarterlyMonths.find(month => month > currentMonth) || quarterlyMonths[0];
      const nextYear = nextQuarterlyMonth === quarterlyMonths[0] && currentMonth > 9 ? currentYear + 1 : currentYear;
      const nextDate = new Date(nextYear, nextQuarterlyMonth, 1);
      
      return {
        due: false,
        message: `Not a quarterly month. Order month: ${getMonthName(currentMonth)}. Next processing: ${getMonthName(nextQuarterlyMonth)} ${nextYear}`,
        nextDate: nextDate.toISOString()
      };
    }
    
    // Check if we're in the first few days of the quarterly month
    const dayOfMonth = orderDate.getDate();
    if (dayOfMonth > 3) {
      const nextQuarterlyMonth = quarterlyMonths.find(month => month > currentMonth) || quarterlyMonths[0];
      const nextYear = nextQuarterlyMonth === quarterlyMonths[0] ? currentYear + 1 : currentYear;
      const nextDate = new Date(nextYear, nextQuarterlyMonth, 1);
      
      return {
        due: false,
        message: `Quarterly processing window passed for ${getMonthName(currentMonth)} ${currentYear}. Next: ${getMonthName(nextQuarterlyMonth)} ${nextYear}`,
        nextDate: nextDate.toISOString()
      };
    }
    
    // Check if we already processed this quarter for this shop
    const lastProcessed = await getLastProcessingDate(shopDomain);
    if (lastProcessed) {
      const lastProcessedDate = new Date(lastProcessed);
      const lastProcessedMonth = lastProcessedDate.getMonth();
      const lastProcessedYear = lastProcessedDate.getFullYear();
      
      if (lastProcessedMonth === currentMonth && lastProcessedYear === currentYear) {
        const nextQuarterlyMonth = quarterlyMonths.find(month => month > currentMonth) || quarterlyMonths[0];
        const nextYear = nextQuarterlyMonth === quarterlyMonths[0] ? currentYear + 1 : currentYear;
        const nextDate = new Date(nextYear, nextQuarterlyMonth, 1);
        
        return {
          due: false,
          message: `Already processed this quarter (${getMonthName(currentMonth)} ${currentYear}) for ${shopDomain}. Next: ${getMonthName(nextQuarterlyMonth)} ${nextYear}`,
          nextDate: nextDate.toISOString()
        };
      }
    }
    
    return {
      due: true,
      message: `Quarterly processing due for ${shopDomain} - ${getMonthName(currentMonth)} ${currentYear}`,
      currentQuarter: getMonthName(currentMonth)
    };
    
  } catch (error) {
    console.error(`❌ Error checking quarterly processing due for ${shopDomain}:`, error);
    return {
      due: false,
      message: `Error checking schedule: ${error.message}`
    };
  }
}

// Process orders using direct Shopify API calls
async function processOrdersWithDirectAPI(shopDomain) {
  try {
    console.log(`🔗 Making direct API calls to ${shopDomain}`);
    
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      throw new Error("SHOPIFY_API_KEY and SHOPIFY_API_SECRET environment variables are required");
    }
    
    // Create GraphQL client for direct API calls
    const graphqlEndpoint = `https://${shopDomain}/admin/api/2025-07/graphql.json`;
    
    // Get access token for this shop (you'll need to implement this based on your auth flow)
    const accessToken = await getShopAccessToken(shopDomain);
    
    if (!accessToken) {
      throw new Error(`No access token found for shop: ${shopDomain}`);
    }
    
    // Create a mock admin object that mimics the authenticate.admin result
    const mockAdmin = {
      graphql: async (query, options = {}) => {
        const response = await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({
            query: query,
            variables: options.variables || {}
          })
        });
        
        return {
          json: () => response.json()
        };
      }
    };
    
    // Import and call the existing processing function
    const { processOrdersAutomatically } = await import("./api.automation");
    
    // Create form data with quarterly settings
    const formData = new FormData();
    formData.append("action", "processOrders");
    formData.append("dataPeriod", "3"); // 3 months for quarterly
    
    console.log("📊 Processing last 3 months of orders via direct API...");
    
    // Process orders using the existing logic
    const result = await processOrdersAutomatically(mockAdmin, formData);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error processing orders with direct API for ${shopDomain}:`, error);
    throw error;
  }
}

// Get access token for a shop (implement based on your storage mechanism)
async function getShopAccessToken(shopDomain) {
  try {
    // This is a placeholder - you'll need to implement this based on how you store access tokens
    // Options:
    // 1. Environment variable for single shop: process.env.SHOPIFY_ACCESS_TOKEN
    // 2. Database lookup for multi-shop
    // 3. Session storage lookup
    
    // For single shop, you can use an environment variable
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (accessToken) {
      console.log(`✅ Found access token for ${shopDomain}`);
      return accessToken;
    }
    
    // For multi-shop, you'd query your database here
    // const token = await db.getAccessTokenForShop(shopDomain);
    
    console.error(`❌ No access token found for shop: ${shopDomain}`);
    return null;
    
  } catch (error) {
    console.error(`❌ Error getting access token for ${shopDomain}:`, error);
    return null;
  }
}

// Get last processing date for a specific shop
async function getLastProcessingDate(shopDomain) {
  try {
    const envKey = `LAST_PROCESSING_${shopDomain.replace(/[.-]/g, '_').toUpperCase()}`;
    return process.env[envKey] || null;
  } catch (error) {
    console.error(`❌ Error getting last processing date for ${shopDomain}:`, error);
    return null;
  }
}

// Update last processing date for a specific shop
async function updateLastProcessingDate(shopDomain) {
  try {
    const now = new Date().toISOString();
    console.log(`📅 Updated last processing date for ${shopDomain} to: ${now}`);
    console.log(`💡 To persist this, set environment variable: LAST_PROCESSING_${shopDomain.replace(/[.-]/g, '_').toUpperCase()}=${now}`);
    return now;
  } catch (error) {
    console.error(`❌ Error updating last processing date for ${shopDomain}:`, error);
  }
}

// Helper function to get month name
function getMonthName(monthIndex) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return months[monthIndex];
}
