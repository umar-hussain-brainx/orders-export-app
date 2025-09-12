import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Simple endpoint for Heroku Scheduler with quarterly check
// Heroku Scheduler will call: POST /scheduler/process daily, but we only process quarterly
export async function action({ request }) {
  console.log("🚀 Heroku Scheduler triggered - checking if quarterly processing is due...");
  
  try {
    // Get shop domain from request body or query params (for multi-store support)
    const url = new URL(request.url);
    let shopDomain = url.searchParams.get("shop") || process.env.SHOPIFY_SHOP_DOMAIN;
    
    // Try to get from form data if it's a POST with body
    if (request.method === "POST" && request.headers.get("content-type")?.includes("form")) {
      try {
        const formData = await request.formData();
        shopDomain = formData.get("shop") || shopDomain;
      } catch (e) {
        // Ignore form data parsing errors, use query params instead
      }
    }
    
    if (!shopDomain) {
      console.error("❌ Shop domain not provided in request or environment");
      return json({ 
        success: false, 
        error: "Shop domain required. Pass as 'shop' parameter or set SHOPIFY_SHOP_DOMAIN env var" 
      }, { status: 400 });
    }

    console.log(`📍 Processing for shop: ${shopDomain}`);

    // Check for test mode (bypass quarterly checks)
    const testMode = url.searchParams.get("test") === "true";
    
    if (testMode) {
      console.log("🧪 TEST MODE: Bypassing quarterly checks");
    }

    // Check if quarterly processing is due for this shop
    const shouldProcess = testMode ? { due: true, message: "Test mode enabled" } : await isQuarterlyProcessingDue(shopDomain);
    
    if (!shouldProcess.due) {
      console.log(`⏭️ Quarterly processing not due yet for ${shopDomain}. ${shouldProcess.message}`);
      return json({
        success: true,
        shop: shopDomain,
        message: shouldProcess.message,
        nextProcessingDate: shouldProcess.nextDate,
        skipped: true
      });
    }

    console.log(`✅ Quarterly processing is due for ${shopDomain}! Starting processing...`);

    // Authenticate with Shopify (this will work for any shop that has the app installed)
    const { admin } = await authenticate.admin(request);
     console.log("🔑 Authenticated with Shopify");
    // Import the processing function from api.automation
    const { processOrdersAutomatically } = await import("./api.automation");
    
    // Create form data with default quarterly settings
    const processingFormData = new FormData();
    processingFormData.append("action", "processOrders");
    processingFormData.append("dataPeriod", "3"); // 3 months for quarterly
    
    console.log("📊 Processing last 3 months of orders...");
    
    // Process orders
    const result = await processOrdersAutomatically(admin, processingFormData);
    
    // Update last processing date for this shop
    await updateLastProcessingDate(shopDomain);
    
    console.log(`✅ Quarterly processing completed successfully for ${shopDomain}`);
    
    return json({
      success: true,
      shop: shopDomain,
      message: `Quarterly processing completed for ${shopDomain}`,
      result: result,
      processedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Heroku Scheduler processing failed:", error);
    
    return json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

// Check if quarterly processing is due (every 3 months) for a specific shop
async function isQuarterlyProcessingDue(shopDomain) {
  try {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();
    
    // Quarterly months: January (0), April (3), July (6), October (9)
    const quarterlyMonths = [0, 3, 6, 9, 8];
    const isQuarterlyMonth = quarterlyMonths.includes(currentMonth);
    
    if (!isQuarterlyMonth) {
      const nextQuarterlyMonth = quarterlyMonths.find(month => month > currentMonth) || quarterlyMonths[0];
      const nextYear = nextQuarterlyMonth === quarterlyMonths[0] && currentMonth > 9 ? currentYear + 1 : currentYear;
      const nextDate = new Date(nextYear, nextQuarterlyMonth, 1);
      
      return {
        due: false,
        message: `Not a quarterly month. Current: ${getMonthName(currentMonth)}. Next processing: ${getMonthName(nextQuarterlyMonth)} ${nextYear}`,
        nextDate: nextDate.toISOString()
      };
    }
    
    // Check if we're in the first few days of the quarterly month
    const dayOfMonth = now.getDate();
    if (dayOfMonth > 15) {
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

// Get last processing date for a specific shop
async function getLastProcessingDate(shopDomain) {
  try {
    // Store per-shop processing dates using environment variables
    // Format: LAST_PROCESSING_SHOP_DOMAIN (replace dots and dashes with underscores)
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
    
    // In a real implementation, you'd store this in a database
    // For now, we'll just log it (Heroku config vars would need to be set via API)
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

// GET method for testing
export async function loader({ request }) {
  return json({
    message: "Heroku Scheduler endpoint ready",
    method: "POST",
    endpoint: "/scheduler/process",
    description: "Processes quarterly orders and updates upsell metaobjects"
  });
}
