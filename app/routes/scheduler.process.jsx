import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Simple endpoint for Heroku Scheduler with quarterly check
// Heroku Scheduler will call: POST /scheduler/process daily, but we only process quarterly
export async function action({ request }) {
  console.log("🚀 Heroku Scheduler triggered - checking if quarterly processing is due...");
  
  try {
    // Get the shop from environment or request
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    
    if (!shopDomain) {
      console.error("❌ SHOPIFY_SHOP_DOMAIN environment variable not set");
      return json({ 
        success: false, 
        error: "Shop domain not configured" 
      }, { status: 400 });
    }

    // Check if quarterly processing is due
    const shouldProcess = await isQuarterlyProcessingDue();
    
    if (!shouldProcess.due) {
      console.log(`⏭️ Quarterly processing not due yet. ${shouldProcess.message}`);
      return json({
        success: true,
        message: shouldProcess.message,
        nextProcessingDate: shouldProcess.nextDate,
        skipped: true
      });
    }

    console.log("✅ Quarterly processing is due! Starting processing...");

    // Authenticate with Shopify
    const { admin } = await authenticate.admin(request);
    
    // Import the processing function from api.automation
    const { processOrdersAutomatically } = await import("./api.automation");
    
    // Create form data with default quarterly settings
    const formData = new FormData();
    formData.append("action", "processOrders");
    formData.append("dataPeriod", "3"); // 3 months for quarterly
    
    console.log("📊 Processing last 3 months of orders...");
    
    // Process orders
    const result = await processOrdersAutomatically(admin, formData);
    
    // Update last processing date
    await updateLastProcessingDate();
    
    console.log("✅ Quarterly processing completed successfully");
    
    return json({
      success: true,
      message: "Quarterly processing completed",
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

// Check if quarterly processing is due (every 3 months)
async function isQuarterlyProcessingDue() {
  try {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();
    
    // Quarterly months: January (0), April (3), July (6), October (9)
    const quarterlyMonths = [0, 3, 6, 9];
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
    
    // Check if we already processed this quarter
    const lastProcessed = await getLastProcessingDate();
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
          message: `Already processed this quarter (${getMonthName(currentMonth)} ${currentYear}). Next: ${getMonthName(nextQuarterlyMonth)} ${nextYear}`,
          nextDate: nextDate.toISOString()
        };
      }
    }
    
    return {
      due: true,
      message: `Quarterly processing due for ${getMonthName(currentMonth)} ${currentYear}`,
      currentQuarter: getMonthName(currentMonth)
    };
    
  } catch (error) {
    console.error("❌ Error checking quarterly processing due:", error);
    return {
      due: false,
      message: `Error checking schedule: ${error.message}`
    };
  }
}

// Get last processing date from environment or file
async function getLastProcessingDate() {
  try {
    // In production, we'll store this in an environment variable or simple file
    // For now, return null to allow first run
    return process.env.LAST_QUARTERLY_PROCESSING || null;
  } catch (error) {
    console.error("❌ Error getting last processing date:", error);
    return null;
  }
}

// Update last processing date
async function updateLastProcessingDate() {
  try {
    const now = new Date().toISOString();
    console.log(`📅 Updated last processing date to: ${now}`);
    // In a real implementation, you'd store this in a database or persistent storage
    // For Heroku, we can use config vars
    return now;
  } catch (error) {
    console.error("❌ Error updating last processing date:", error);
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
