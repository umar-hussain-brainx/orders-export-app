import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Webhook handler for orders/create - triggers quarterly processing check
export async function action({ request }) {
  console.log("🛒 Order created webhook received");
  const { admin,payload } = await authenticate.webhook(request);
  try {
    // Parse the webhook payload
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
    
    // Determine quarter info for database record
    const currentMonth = orderCreatedAt.getMonth();
    const currentYear = orderCreatedAt.getFullYear();
    const quarter = Math.floor(currentMonth / 3) + 1;
    const adjustedQuarter = currentMonth === 8 ? 3 : quarter; // September = Q3 for testing
    
    let processingResult;
    let orderCount = null;
    
    try {
      // Process orders using authenticated admin object
      processingResult = await processOrdersWithAdmin(admin);
      orderCount = processingResult?.result?.orders_processed || null;
      
      // Record successful processing in database
      await recordQuarterlyProcessing(shopDomain, currentYear, adjustedQuarter, currentMonth, true, orderCount);
      
      console.log(`✅ Quarterly processing completed for ${shopDomain} Q${adjustedQuarter} ${currentYear}`);
      
      return json({
        success: true,
        shop: shopDomain,
        quarter: adjustedQuarter,
        year: currentYear,
        message: `Quarterly processing completed for ${shopDomain} Q${adjustedQuarter} ${currentYear}`,
        result: processingResult,
        processedAt: new Date().toISOString(),
        triggeredBy: `order_${order.id}`,
        orderCount: orderCount
      });
      
    } catch (processingError) {
      // Record failed processing in database
      await recordQuarterlyProcessing(shopDomain, currentYear, adjustedQuarter, currentMonth, false, null, processingError.message);
      
      console.error(`❌ Quarterly processing failed for ${shopDomain}:`, processingError);
      throw processingError;
    }
    
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
    const quarterlyMonths = [0, 3, 6, 9, 8];
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
    if (dayOfMonth > 18) {
      const nextQuarterlyMonth = quarterlyMonths.find(month => month > currentMonth) || quarterlyMonths[0];
      const nextYear = nextQuarterlyMonth === quarterlyMonths[0] ? currentYear + 1 : currentYear;
      const nextDate = new Date(nextYear, nextQuarterlyMonth, 1);
      
      return {
        due: false,
        message: `Quarterly processing window passed for ${getMonthName(currentMonth)} ${currentYear}. Next: ${getMonthName(nextQuarterlyMonth)} ${nextYear}`,
        nextDate: nextDate.toISOString()
      };
    }
    
    // Determine which quarter this is
    const quarter = Math.floor(currentMonth / 3) + 1; // Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
    // Special case for September testing (treat as Q3)
    const adjustedQuarter = currentMonth === 8 ? 3 : quarter;
    
    // Check if we already processed this quarter for this shop using database
    const processingStatus = await hasQuarterlyProcessingCompleted(shopDomain, currentYear, adjustedQuarter, currentMonth);
    
    if (processingStatus.completed) {
      const nextQuarterlyMonth = quarterlyMonths.find(month => month > currentMonth) || quarterlyMonths[0];
      const nextYear = nextQuarterlyMonth === quarterlyMonths[0] ? currentYear + 1 : currentYear;
      const nextDate = new Date(nextYear, nextQuarterlyMonth, 1);
      
      return {
        due: false,
        message: `Already processed this quarter Q${adjustedQuarter} ${currentYear} for ${shopDomain} on ${processingStatus.processedAt}. Next: ${getMonthName(nextQuarterlyMonth)} ${nextYear}`,
        nextDate: nextDate.toISOString(),
        alreadyProcessed: true
      };
    }
    
    return {
      due: true,
      message: `Quarterly processing due for ${shopDomain} - ${getMonthName(currentMonth)} ${currentYear}`,
      currentQuarter: getMonthName(currentMonth),
      quarter: adjustedQuarter,
      year: currentYear
    };
    
  } catch (error) {
    console.error(`❌ Error checking quarterly processing due for ${shopDomain}:`, error);
    return {
      due: false,
      message: `Error checking schedule: ${error.message}`
    };
  }
}

// Process orders using authenticated admin object
async function processOrdersWithAdmin(admin) {
  try {
    console.log("📊 Processing orders using authenticated admin object...");
    
    // Import and call the existing processing function
    const { processOrdersAutomatically } = await import("./api.automation");
    
    // Create form data with quarterly settings
    const formData = new FormData();
    formData.append("action", "processOrders");
    formData.append("dataPeriod", "3"); // 3 months for quarterly
    
    console.log("📊 Processing last 3 months of orders...");
    
    // Process orders using the existing logic with authenticated admin
    const result = await processOrdersAutomatically(admin, formData);
    
    return result;
    
  } catch (error) {
    console.error("❌ Error processing orders with admin object:", error);
    throw error;
  }
}

// No need for manual access token management - using authenticate.webhook(request)

// Check if quarterly processing already completed for this shop/quarter
async function hasQuarterlyProcessingCompleted(shopDomain, year, quarter, month) {
  try {
    const existingRecord = await prisma.quarterlyProcessing.findUnique({
      where: {
        shop_year_quarter: {
          shop: shopDomain,
          year: year,
          quarter: quarter
        }
      }
    });

    if (existingRecord) {
      console.log(`✅ Found existing quarterly processing record for ${shopDomain} Q${quarter} ${year}`);
      return {
        completed: true,
        processedAt: existingRecord.processedAt,
        success: existingRecord.success
      };
    }

    console.log(`❌ No quarterly processing record found for ${shopDomain} Q${quarter} ${year}`);
    return { completed: false };

  } catch (error) {
    console.error(`❌ Error checking quarterly processing status for ${shopDomain}:`, error);
    return { completed: false, error: error.message };
  }
}

// Record quarterly processing completion in database
async function recordQuarterlyProcessing(shopDomain, year, quarter, month, success = true, orderCount = null, errorMessage = null) {
  try {
    const record = await prisma.quarterlyProcessing.upsert({
      where: {
        shop_year_quarter: {
          shop: shopDomain,
          year: year,
          quarter: quarter
        }
      },
      update: {
        processedAt: new Date(),
        success: success,
        orderCount: orderCount,
        errorMessage: errorMessage
      },
      create: {
        shop: shopDomain,
        year: year,
        quarter: quarter,
        month: month,
        success: success,
        orderCount: orderCount,
        errorMessage: errorMessage
      }
    });

    console.log(`📅 Recorded quarterly processing for ${shopDomain} Q${quarter} ${year}: ${success ? 'SUCCESS' : 'FAILED'}`);
    return record;

  } catch (error) {
    console.error(`❌ Error recording quarterly processing for ${shopDomain}:`, error);
    throw error;
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
