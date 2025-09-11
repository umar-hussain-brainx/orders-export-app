import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Simple endpoint for Heroku Scheduler
// Heroku Scheduler will call: POST /scheduler/process
export async function action({ request }) {
  console.log("🚀 Heroku Scheduler triggered quarterly processing...");
  
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
    
    console.log("✅ Quarterly processing completed successfully");
    
    return json({
      success: true,
      message: "Quarterly processing completed",
      result: result
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

// GET method for testing
export async function loader({ request }) {
  return json({
    message: "Heroku Scheduler endpoint ready",
    method: "POST",
    endpoint: "/scheduler/process",
    description: "Processes quarterly orders and updates upsell metaobjects"
  });
}
