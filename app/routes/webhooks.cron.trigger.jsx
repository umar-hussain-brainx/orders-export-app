// Webhook endpoint for external cron triggers
// This can be called by external cron services like GitHub Actions, Vercel Cron, etc.

import { authenticate } from "../shopify.server.js";

export async function action({ request }) {
  console.log("🔔 Webhook cron trigger received");
  
  try {
    // Verify the request (you can add authentication here)
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.WEBHOOK_SECRET || "your-secret-token";
    
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      console.log("❌ Unauthorized webhook request");
      return new Response("Unauthorized", { status: 401 });
    }

    // Get shop domain from headers or body
    const body = await request.formData();
    const shopDomain = body.get("shop") || request.headers.get("x-shopify-shop-domain");
    
    if (!shopDomain) {
      console.log("❌ No shop domain provided");
      return new Response("Shop domain required", { status: 400 });
    }

    console.log(`🏪 Processing cron job for shop: ${shopDomain}`);

    // Create a mock request with shop context for authentication
    const mockRequest = new Request(`https://${shopDomain}/admin`, {
      headers: {
        'X-Shopify-Shop-Domain': shopDomain,
        'Authorization': request.headers.get('authorization')
      }
    });

    // Authenticate with Shopify
    const { admin } = await authenticate.admin(mockRequest);

    // Load saved configuration
    const configResult = await loadConfiguration(admin);
    const config = configResult.success ? configResult.config : {
      dataPeriod: 3,
      schedule: 'quarterly'
    };

    // Process orders automatically
    const processData = new FormData();
    processData.append("dataPeriod", config.dataPeriod.toString());
    processData.append("startDate", new Date(Date.now() - (config.dataPeriod * 30 * 24 * 60 * 60 * 1000)).toISOString());
    processData.append("endDate", new Date().toISOString());

    const result = await processOrdersAutomatically(admin, processData);

    console.log("✅ Cron job completed:", result);

    return new Response(JSON.stringify({
      success: true,
      message: "Cron job executed successfully",
      shop: shopDomain,
      result: result
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("❌ Webhook cron error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Import functions from api.automation.jsx
async function loadConfiguration(admin) {
  try {
    const configMetaobject = await findConfigMetaobject(admin);
    
    if (configMetaobject) {
      const config = parseConfigFromMetaobject(configMetaobject);
      return { success: true, config: config };
    } else {
      return {
        success: true,
        config: {
          dataPeriod: 3,
          schedule: "quarterly",
          aiProvider: "openai",
          confidenceThreshold: 0.7,
          maxBatches: 20,
          enableNotifications: true
        }
      };
    }
  } catch (error) {
    console.error("❌ Error loading configuration:", error);
    return { success: false, error: error.message };
  }
}

async function findConfigMetaobject(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
        query findConfigMetaobject {
          metaobjects(type: "upsell_config_settings", first: 1) {
            edges {
              node {
                id
                handle
                type
                fields {
                  key
                  value
                }
              }
            }
          }
        }`
    );

    const responseJson = await response.json();
    const metaobjects = responseJson.data?.metaobjects?.edges;
    
    if (metaobjects && metaobjects.length > 0) {
      return metaobjects[0].node;
    }
    
    return null;
  } catch (error) {
    console.error("❌ Error finding config metaobject:", error);
    return null;
  }
}

function parseConfigFromMetaobject(metaobject) {
  const fields = {};
  metaobject.fields.forEach(field => {
    fields[field.key] = field.value;
  });

  return {
    dataPeriod: parseInt(fields.data_period || "3"),
    schedule: fields.schedule || "quarterly",
    aiProvider: fields.ai_provider || "openai",
    confidenceThreshold: parseFloat(fields.confidence_threshold || "0.7"),
    maxBatches: parseInt(fields.max_batches || "20"),
    enableNotifications: fields.enable_notifications === "true"
  };
}

async function processOrdersAutomatically(admin, formData) {
  // Import and call the function from api.automation.jsx
  const { processOrdersAutomatically: processOrders } = await import('./api.automation.jsx');
  return await processOrders(admin, formData);
}

