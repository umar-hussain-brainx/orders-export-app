// API Route for Automated Order Processing
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    console.log("🚀 API automation called");
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const action = formData.get("action");
    console.log(`🎯 Action requested: ${action}`);

    switch (action) {
      case "processOrders":
        console.log("📦 Processing orders...");
        return await processOrdersAutomatically(admin, formData);
      case "createMetaobjectDefinitions":
        console.log("🔧 Creating metaobject definitions...");
        const result = await createMetaobjectDefinitions(admin);
        console.log("📊 Metaobject creation result:", result);
        return result;
      case "saveConfiguration":
        console.log("💾 Saving configuration...");
        const saveResult = await saveConfiguration(admin, formData);
        
        // Configuration saved successfully (no cron jobs to restart with Heroku Scheduler)
        
        return saveResult;
      case "loadConfiguration":
        console.log("📂 Loading configuration...");
        return await loadConfiguration(admin);
      case "manageCronJobs":
        console.log("⏰ Cron jobs not needed with Heroku Scheduler");
        return { success: true, message: "Using Heroku Scheduler instead of local cron jobs" };
      case "testAIIntegration":
        console.log("🤖 Testing AI integration...");
        return await testAIIntegration(formData);
      default:
        console.log(`❌ Unknown action: ${action}`);
        return { success: false, error: "Unknown action" };
    }
  } catch (error) {
    console.error("❌ Automation API Error:", error);
    return { success: false, error: error.message };
  }
};

// Process orders automatically (called by cron or webhook)
async function processOrdersAutomatically(admin, formData) {
  try {
    // Load saved configuration or use defaults
    let dataPeriodMonths = parseInt(formData.get("dataPeriod"));
    
    // If no dataPeriod provided, load from saved configuration
    if (!dataPeriodMonths || isNaN(dataPeriodMonths)) {
      const configResult = await loadConfiguration(admin);
      dataPeriodMonths = configResult.success ? configResult.config.dataPeriod : 1;
    }
    
    const endDate = formData.get("endDate") || new Date().toISOString();
    const startDate = formData.get("startDate") || new Date(Date.now() - (dataPeriodMonths * 30 * 24 * 60 * 60 * 1000)).toISOString(); // configurable months ago
    
    console.log(`🔄 Processing orders from ${startDate} to ${endDate} (${dataPeriodMonths} months of data)`);

    // 1. Export orders from Shopify
    const orders = await exportOrdersFromShopify(admin, startDate, endDate);
    
    if (orders.length === 0) {
      return { success: true, message: "No new orders to process", orders: [] };
    }

    console.log(`📦 Found ${orders.length} orders to process`);

    // 2. Process with AI
    const aiResults = await processOrdersWithAI(orders);

    // 3. Store results in metaobjects
    const metaobjectResults = await storeResultsInMetaobjects(admin, aiResults, formData);

    return {
      success: true,
      processed_orders: orders.length,
      ai_results: aiResults,
      metaobject_results: metaobjectResults,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("❌ Error in processOrdersAutomatically:", error);
    return { success: false, error: error.message };
  }
}

// Export orders from Shopify for a date range
async function exportOrdersFromShopify(admin, startDate, endDate) {
  try {
    const query = `created_at:>=${startDate} created_at:<=${endDate}`;
    
    let allOrders = [];
    let hasNextPage = true;
    let cursor = null;
    let batchCount = 0;
    const maxBatches = 20; // Limit for 1 month of data

    while (hasNextPage && batchCount < maxBatches) {
      const variables = {
        query,
        first: 250,
      };

      if (cursor) {
        variables.after = cursor;
      }

      const response = await admin.graphql(
        `#graphql
          query getOrdersForAutomation($query: String!, $first: Int!, $after: String) {
            orders(query: $query, first: $first, after: $after) {
              edges {
                node {
                  id
                  name
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  totalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  customer {
                    id
                    firstName
                    lastName
                    email
                  }
                  lineItems(first: 250) {
                    edges {
                      node {
                        id
                        name
                        quantity
                        sku
                        variantTitle
                        originalUnitPriceSet {
                          shopMoney {
                            amount
                            currencyCode
                          }
                        }
                        product {
                          id
                          title
                          handle
                          productType
                          vendor
                          tags
                        }
                        variant {
                          id
                          title
                          sku
                          barcode
                        }
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }`,
        { variables }
      );

      const responseJson = await response.json();
      const orders = responseJson.data.orders.edges.map(edge => edge.node);
      
      allOrders = allOrders.concat(orders);
      hasNextPage = responseJson.data.orders.pageInfo.hasNextPage;
      cursor = responseJson.data.orders.pageInfo.endCursor;
      batchCount++;

      // Small delay to avoid rate limiting
      if (hasNextPage && batchCount < maxBatches) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Transform data for AI processing
    return allOrders.map(order => ({
      order_id: order.id.replace("gid://shopify/Order/", ""),
      order_name: order.name,
      created_at: order.createdAt,
      financial_status: order.displayFinancialStatus,
      fulfillment_status: order.displayFulfillmentStatus,
      total_price: parseFloat(order.totalPriceSet.shopMoney.amount),
      currency: order.totalPriceSet.shopMoney.currencyCode,
      customer: {
        id: order.customer?.id?.replace("gid://shopify/Customer/", "") || "",
        name: order.customer ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim() : "",
        email: order.customer?.email || ""
      },
      line_items: order.lineItems.edges.map(edge => {
        const item = edge.node;
        return {
          line_item_id: item.id.replace("gid://shopify/LineItem/", ""),
          product_id: item.product?.id?.replace("gid://shopify/Product/", "") || "",
          product_title: item.product?.title || "",
          product_handle: item.product?.handle || "",
          product_type: item.product?.productType || "",
          vendor: item.product?.vendor || "",
          tags: item.product?.tags || [],
          variant_id: item.variant?.id?.replace("gid://shopify/ProductVariant/", "") || "",
          variant_title: item.variant?.title || item.variantTitle || "",
          variant_sku: item.variant?.sku || "",
          variant_barcode: item.variant?.barcode || "",
          quantity: item.quantity,
          unit_price: parseFloat(item.originalUnitPriceSet.shopMoney.amount),
          currency: item.originalUnitPriceSet.shopMoney.currencyCode
        };
      })
    }));

  } catch (error) {
    console.error("❌ Error exporting orders from Shopify:", error);
    throw error;
  }
}

// Process orders with AI to create pairs/recommendations
async function processOrdersWithAI(orders) {
  try {
    console.log("🤖 Processing orders with AI...");

    // Prepare data for AI
    const analysisData = prepareDataForAI(orders);
    
    // Call AI service (OpenAI example)
    const aiResponse = await callAIService(analysisData);
    
    return aiResponse;
  } catch (error) {
    console.error("❌ Error processing with AI:", error);
    // Return default structure if AI fails
    return {
      upsell_recommendations: [],
      fallback_used: true
    };
  }
}

// Prepare order data for AI analysis
function prepareDataForAI(orders) {
  // Extract product co-purchase patterns
  const coPurchases = {};
  const customerPurchases = {};
  const productFrequency = {};

  orders.forEach(order => {
    const products = order.line_items.map(item => ({
      id: item.product_id,
      title: item.product_title,
      type: item.product_type,
      vendor: item.vendor,
      quantity: item.quantity,
      price: item.unit_price
    }));

    // Track customer purchase patterns
    if (order.customer.id) {
      if (!customerPurchases[order.customer.id]) {
        customerPurchases[order.customer.id] = [];
      }
      customerPurchases[order.customer.id].push(...products);
    }

    // Track product co-purchases
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        const key = `${products[i].id}-${products[j].id}`;
        coPurchases[key] = (coPurchases[key] || 0) + 1;
      }
    }

    // Track product frequency
    products.forEach(product => {
      productFrequency[product.id] = (productFrequency[product.id] || 0) + product.quantity;
    });
  });

  return {
    orders_count: orders.length,
    co_purchases: coPurchases,
    customer_purchases: customerPurchases,
    product_frequency: productFrequency,
    date_range: {
      start: orders[0]?.created_at,
      end: orders[orders.length - 1]?.created_at
    }
  };
}

// Call AI service (OpenAI example)
async function callAIService(analysisData) {
  try {
    const prompt = createAIPrompt(analysisData);
    
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
            content: 'You are an expert e-commerce analyst. Analyze order patterns and create actionable product recommendations and pairs. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices[0].message.content;
    
    try {
      return JSON.parse(content);
    } catch (parseError) {
      console.error("❌ Error parsing AI JSON response:", parseError);
      return createFallbackResponse(analysisData);
    }
  } catch (error) {
    console.error("❌ Error calling AI service:", error);
    return createFallbackResponse(analysisData);
  }
}

// Create AI prompt
function createAIPrompt(data) {
  const topCoPurchases = Object.entries(data.co_purchases)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);

  const topProducts = Object.entries(data.product_frequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);

  return `
TASK: Analyze e-commerce order data to create upsell recommendations for cart optimization.

GOAL: When customers add a "main_product" to cart, show them "upsellVariants" that are frequently bought together.

DATA ANALYSIS:
- Orders analyzed: ${data.orders_count}
- Co-purchase patterns: ${JSON.stringify(topCoPurchases)}
- Popular products: ${JSON.stringify(topProducts)}

INSTRUCTIONS:
1. Find products that are frequently bought together
2. For each main product, identify 2-4 products that customers often add to the same order
3. Focus on products with high co-purchase frequency (bought together multiple times)
4. Create upsell recommendations to increase average order value

REQUIRED OUTPUT FORMAT - Return ONLY this JSON structure:
{
  "upsell_recommendations": [
    {
      "main_product": "7148360237189",
      "upsellVariants": [
        {"id": "7148360630405"},
        {"id": "7148360728709"},
        {"id": "7148360761477"}
      ]
    },
    {
      "main_product": "4120463068435", 
      "upsellVariants": [
        {"id": "7148360695941"},
        {"id": "7148360728709"}
      ]
    }
  ]
}

IMPORTANT RULES:
- Use actual product IDs from the data (remove gid://shopify/Product/ prefix)
- Only include products that are genuinely bought together (frequency > 2)
- Limit 2-4 upsellVariants per main_product
- Focus on increasing sales through smart recommendations
- NO other fields needed - just main_product and upsellVariants array
`;
}

// Create fallback response when AI fails - generates your exact JSON format
function createFallbackResponse(data) {
  const upsellRecommendations = [];
  const processedMainProducts = new Set();

  // Process co-purchase data to create upsell recommendations
  const sortedCoPurchases = Object.entries(data.co_purchases)
    .sort(([,a], [,b]) => b - a)
    .filter(([, frequency]) => frequency > 2); // Only products bought together more than 2 times

  sortedCoPurchases.forEach(([pair, frequency]) => {
    const [product1, product2] = pair.split('-');
    
    // Clean product IDs (remove gid prefix if present)
    const mainProduct = product1.replace('gid://shopify/Product/', '');
    const upsellProduct = product2.replace('gid://shopify/Product/', '');

    // Add to main product's upsell list
    if (!processedMainProducts.has(mainProduct)) {
      upsellRecommendations.push({
        main_product: mainProduct,
        upsellVariants: []
      });
      processedMainProducts.add(mainProduct);
    }

    // Find the main product entry and add upsell variant
    const mainProductEntry = upsellRecommendations.find(item => item.main_product === mainProduct);
    if (mainProductEntry && mainProductEntry.upsellVariants.length < 4) {
      // Avoid duplicates
      const alreadyExists = mainProductEntry.upsellVariants.some(variant => variant.id === upsellProduct);
      if (!alreadyExists) {
        mainProductEntry.upsellVariants.push({ id: upsellProduct });
      }
    }
  });

  return {
    upsell_recommendations: upsellRecommendations.slice(0, 10), // Limit to top 10 main products
    fallback_used: true
  };
}

// Store AI results in Shopify metaobjects (update existing entries)
async function storeResultsInMetaobjects(admin, aiResults, formData) {
  try {
    console.log("💾 Updating AI results in existing metaobjects...");

    const results = [];

    // Update the single main metaobject with all AI results
    const mainMetaobject = await updateMainAnalysisMetaobject(admin, aiResults, formData);
    results.push(mainMetaobject);

    return {
      success: true,
      stored_objects: results.length,
      results: results,
      updated_existing: true
    };

  } catch (error) {
    console.error("❌ Error updating metaobjects:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper function to get data period label
function getDataPeriodLabel(months) {
  switch(months) {
    case 1: return "1_month";
    case 3: return "3_months"; 
    case 6: return "6_months";
    case 12: return "1_year";
    default: return `${months}_months`;
  }
}

// No transformation function needed - AI returns data in your exact format!

// Update main analysis metaobject with all AI results
async function updateMainAnalysisMetaobject(admin, aiResults, formData) {
  try {
    // First, try to find existing metaobject
    const existingMetaobject = await findExistingAnalysisMetaobject(admin);
    
    // Get data period from form data or default to 1 month
    const dataPeriodMonths = parseInt(formData.get("dataPeriod") || "1");
    const dataPeriodLabel = getDataPeriodLabel(dataPeriodMonths);

    // AI now returns data in your exact format - no transformation needed!
    const upsellData = aiResults.upsell_recommendations || [];
    const alternativeData = []; // Can be used for different upsell strategies later

    const analysisData = {
      upsell_json_data: JSON.stringify(upsellData),
      alternative_upsells: JSON.stringify(alternativeData),
      trending_products: JSON.stringify([]), // Not needed for your use case
      total_pairs_found: upsellData.length.toString(),
      total_trending_products: "0",
      confidence_threshold: "0.7",
      analysis_date: new Date().toISOString(),
      data_period: dataPeriodLabel,
      data_period_months: dataPeriodMonths.toString(),
      fallback_used: (aiResults.fallback_used || false).toString(),
      last_updated: new Date().toISOString()
    };

    if (existingMetaobject) {
      // Update existing metaobject
      console.log(`🔄 Updating existing metaobject: ${existingMetaobject.id}`);
      return await updateMetaobject(admin, existingMetaobject.id, analysisData);
    } else {
      // Create new metaobject if none exists
      console.log("📝 Creating new analysis metaobject");
      return await createMainAnalysisMetaobject(admin, analysisData);
    }
  } catch (error) {
    console.error("❌ Error in updateMainAnalysisMetaobject:", error);
    throw error;
  }
}

// Find existing analysis metaobject
async function findExistingAnalysisMetaobject(admin) {
  try {
    const response = await admin.graphql(
      `#graphql
        query findAnalysisMetaobject {
          metaobjects(type: "upsell_config", first: 1) {
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
    console.error("❌ Error finding existing metaobject:", error);
    return null;
  }
}

// Update existing metaobject
async function updateMetaobject(admin, metaobjectId, data) {
  const fields = Object.entries(data).map(([key, value]) => ({
    key,
    value: value.toString()
  }));

  const response = await admin.graphql(
    `#graphql
      mutation updateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject {
            id
            handle
            fields {
              key
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        id: metaobjectId,
        metaobject: {
          fields: fields
        }
      }
    }
  );

  return await response.json();
}

// Create main analysis metaobject
async function createMainAnalysisMetaobject(admin, data) {
  const fields = Object.entries(data).map(([key, value]) => ({
    key,
    value: value.toString()
  }));

  const response = await admin.graphql(
    `#graphql
      mutation createMainAnalysisMetaobject($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
            fields {
              key
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        metaobject: {
          type: "upsell_config",
          fields: fields
        }
      }
    }
  );

  return await response.json();
}

// Create single comprehensive metaobject definition for upsell configuration
async function createMetaobjectDefinitions(admin) {
  try {
    console.log("🔧 Starting metaobject definition creation...");
    
    const results = [];
    
    // Create Upsell Config metaobject definition (for storing upsell data)
    const upsellConfigDef = await admin.graphql(
      `#graphql
        mutation createUpsellConfigDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              id
              name
              type
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          definition: {
            name: "Upsell Configuration",
            type: "upsell_config",
            fieldDefinitions: [
              { key: "upsell_json_data", name: "Upsell Pairs JSON", type: "multi_line_text_field" },
              { key: "alternative_upsells", name: "Alternative Upsells JSON", type: "multi_line_text_field" },
              { key: "trending_products", name: "Trending Products JSON", type: "multi_line_text_field" },
              { key: "total_pairs_found", name: "Total Pairs Found", type: "number_integer" },
              { key: "total_trending_products", name: "Total Trending Products", type: "number_integer" },
              { key: "confidence_threshold", name: "Confidence Threshold", type: "number_decimal" },
              { key: "analysis_date", name: "Analysis Date", type: "date_time" },
              { key: "data_period", name: "Data Period", type: "single_line_text_field" },
              { key: "data_period_months", name: "Data Period (Months)", type: "number_integer" },
              { key: "fallback_used", name: "Fallback Used", type: "boolean" },
              { key: "last_updated", name: "Last Updated", type: "date_time" }
            ]
          }
        }
      }
    );
    
    console.log("📡 GraphQL request sent, processing response...");
    const result = await upsellConfigDef.json();
    console.log("📊 GraphQL response:", JSON.stringify(result, null, 2));

    // Check for GraphQL errors
    if (result.data?.metaobjectDefinitionCreate?.userErrors?.length > 0) {
      const errors = result.data.metaobjectDefinitionCreate.userErrors;
      console.error("❌ GraphQL user errors:", errors);
      return {
        success: false,
        error: `GraphQL errors: ${errors.map(e => e.message).join(', ')}`
      };
    }

    // Check if metaobject was created successfully
    if (result.data?.metaobjectDefinitionCreate?.metaobjectDefinition) {

      console.log("✅ Upsell Config metaobject definition created successfully!");
      results.push({
        type: "upsell_config",
        definition: result.data.metaobjectDefinitionCreate.metaobjectDefinition
      });
    } else {
      console.error("⚠️ Unexpected response structure for upsell_config:", result);
      results.push({
        type: "upsell_config",
        error: "Unexpected response from Shopify API"
      });
    }

    // Create Upsell Config Settings metaobject definition (for storing app configuration)
    const configSettingsDef = await admin.graphql(
      `#graphql
        mutation createConfigSettingsDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              id
              name
              type
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          definition: {
            name: "Upsell Configuration Settings",
            type: "upsell_config_settings",
            fieldDefinitions: [
              { key: "data_period", name: "Data Period (Months)", type: "number_integer" },
              { key: "schedule", name: "Processing Schedule", type: "single_line_text_field" },
              { key: "ai_provider", name: "AI Provider", type: "single_line_text_field" },
              { key: "confidence_threshold", name: "Confidence Threshold", type: "number_decimal" },
              { key: "max_batches", name: "Max Batches", type: "number_integer" },
              { key: "enable_notifications", name: "Enable Notifications", type: "boolean" },
              { key: "last_updated", name: "Last Updated", type: "date_time" }
            ]
          }
        }
      }
    );

    const configResult = await configSettingsDef.json();
    console.log("📊 Config Settings GraphQL response:", JSON.stringify(configResult, null, 2));

    // Check for GraphQL errors
    if (configResult.data?.metaobjectDefinitionCreate?.userErrors?.length > 0) {
      const errors = configResult.data.metaobjectDefinitionCreate.userErrors;
      console.error("❌ Config Settings GraphQL user errors:", errors);
      results.push({
        type: "upsell_config_settings",
        error: `GraphQL errors: ${errors.map(e => e.message).join(', ')}`
      });
    } else if (configResult.data?.metaobjectDefinitionCreate?.metaobjectDefinition) {
      console.log("✅ Config Settings metaobject definition created successfully!");
      results.push({
        type: "upsell_config_settings",
        definition: configResult.data.metaobjectDefinitionCreate.metaobjectDefinition
      });
    } else {
      console.error("⚠️ Unexpected response structure for config settings:", configResult);
      results.push({
        type: "upsell_config_settings",
        error: "Unexpected response from Shopify API"
      });
    }

    // Return summary of all results
    const successCount = results.filter(r => r.definition).length;
    const errorCount = results.filter(r => r.error).length;
    
    return {
      success: successCount > 0,
      results: results,
      message: `✅ Created ${successCount} metaobject definitions successfully! ${errorCount > 0 ? `(${errorCount} errors)` : ''}`
    };

  } catch (error) {
    console.error("❌ Error creating metaobject definition:", error);
    return {
      success: false,
      error: `Creation failed: ${error.message}`
    };
  }
}

// Save configuration settings
async function saveConfiguration(admin, formData) {
  try {
    console.log("💾 Saving configuration settings...");
    
    const config = {
      dataPeriod: parseInt(formData.get("dataPeriod") || "1"),
      schedule: formData.get("schedule") || "monthly",
      aiProvider: formData.get("aiProvider") || "openai",
      confidenceThreshold: parseFloat(formData.get("confidenceThreshold") || "0.7"),
      maxBatches: parseInt(formData.get("maxBatches") || "20"),
      enableNotifications: formData.get("enableNotifications") === "true"
    };

    // Auto-create metaobject definition if it doesn't exist
    await ensureConfigMetaobjectDefinitionExists(admin);

    // Find or create configuration metaobject
    const configMetaobject = await findOrCreateConfigMetaobject(admin, config);
    
    return {
      success: true,
      message: "✅ Configuration saved successfully!",
      config: config
    };
  } catch (error) {
    console.error("❌ Error saving configuration:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Ensure config metaobject definition exists (auto-create if needed)
async function ensureConfigMetaobjectDefinitionExists(admin) {
  try {
    // Check if definition already exists
    const existingDef = await admin.graphql(
      `#graphql
        query checkConfigDefinition {
          metaobjectDefinitions(type: "upsell_config_settings", first: 1) {
            edges {
              node {
                id
                type
              }
            }
          }
        }`
    );

    const result = await existingDef.json();
    
    if (result.data?.metaobjectDefinitions?.edges?.length > 0) {
      console.log("✅ Config metaobject definition already exists");
      return true;
    }

    console.log("🔧 Creating config metaobject definition...");
    
    // Create the definition
    const createDef = await admin.graphql(
      `#graphql
        mutation createConfigSettingsDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              id
              name
              type
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          definition: {
            name: "Upsell Configuration Settings",
            type: "upsell_config_settings",
            fieldDefinitions: [
              { key: "data_period", name: "Data Period (Months)", type: "number_integer" },
              { key: "schedule", name: "Processing Schedule", type: "single_line_text_field" },
              { key: "ai_provider", name: "AI Provider", type: "single_line_text_field" },
              { key: "confidence_threshold", name: "Confidence Threshold", type: "number_decimal" },
              { key: "max_batches", name: "Max Batches", type: "number_integer" },
              { key: "enable_notifications", name: "Enable Notifications", type: "boolean" },
              { key: "last_updated", name: "Last Updated", type: "date_time" }
            ]
          }
        }
      }
    );

    const createResult = await createDef.json();
    
    if (createResult.data?.metaobjectDefinitionCreate?.userErrors?.length > 0) {
      const errors = createResult.data.metaobjectDefinitionCreate.userErrors;
      console.error("❌ Error creating config definition:", errors);
      return false;
    }

    if (createResult.data?.metaobjectDefinitionCreate?.metaobjectDefinition) {
      console.log("✅ Config metaobject definition created successfully!");
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Error ensuring config definition exists:", error);
    return false;
  }
}

// Load configuration settings
async function loadConfiguration(admin) {
  try {
    console.log("📂 Loading configuration settings...");
    
    // Auto-create metaobject definition if it doesn't exist
    await ensureConfigMetaobjectDefinitionExists(admin);
    
    const configMetaobject = await findConfigMetaobject(admin);
    
    if (configMetaobject) {
      // Parse configuration from metaobject fields
      const config = parseConfigFromMetaobject(configMetaobject);
      return {
        success: true,
        config: config
      };
    } else {
      // Return default configuration
      return {
        success: true,
        config: {
          dataPeriod: 1,
          schedule: "monthly",
          aiProvider: "openai",
          confidenceThreshold: 0.7,
          maxBatches: 20,
          enableNotifications: true
        }
      };
    }
  } catch (error) {
    console.error("❌ Error loading configuration:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Find existing configuration metaobject
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

// Find or create configuration metaobject
async function findOrCreateConfigMetaobject(admin, config) {
  let configMetaobject = await findConfigMetaobject(admin);
  
  if (configMetaobject) {
    // Update existing
    return await updateConfigMetaobject(admin, configMetaobject.id, config);
  } else {
    // Create new
    return await createConfigMetaobject(admin, config);
  }
}

// Create configuration metaobject
async function createConfigMetaobject(admin, config) {
  const response = await admin.graphql(
    `#graphql
      mutation createConfigMetaobject($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
            fields {
              key
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        metaobject: {
          type: "upsell_config_settings",
          fields: [
            { key: "data_period", value: config.dataPeriod.toString() },
            { key: "schedule", value: config.schedule },
            { key: "ai_provider", value: config.aiProvider },
            { key: "confidence_threshold", value: config.confidenceThreshold.toString() },
            { key: "max_batches", value: config.maxBatches.toString() },
            { key: "enable_notifications", value: config.enableNotifications.toString() },
            { key: "last_updated", value: new Date().toISOString() }
          ]
        }
      }
    }
  );

  return await response.json();
}

// Update configuration metaobject
async function updateConfigMetaobject(admin, metaobjectId, config) {
  const fields = [
    { key: "data_period", value: config.dataPeriod.toString() },
    { key: "schedule", value: config.schedule },
    { key: "ai_provider", value: config.aiProvider },
    { key: "confidence_threshold", value: config.confidenceThreshold.toString() },
    { key: "max_batches", value: config.maxBatches.toString() },
    { key: "enable_notifications", value: config.enableNotifications.toString() },
    { key: "last_updated", value: new Date().toISOString() }
  ];

  const response = await admin.graphql(
    `#graphql
      mutation updateConfigMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject {
            id
            handle
            fields {
              key
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        id: metaobjectId,
        metaobject: {
          fields: fields
        }
      }
    }
  );

  return await response.json();
}

// Parse configuration from metaobject fields
function parseConfigFromMetaobject(metaobject) {
  const fields = {};
  metaobject.fields.forEach(field => {
    fields[field.key] = field.value;
  });

  return {
    dataPeriod: parseInt(fields.data_period || "1"),
    schedule: fields.schedule || "monthly",
    aiProvider: fields.ai_provider || "openai",
    confidenceThreshold: parseFloat(fields.confidence_threshold || "0.7"),
    maxBatches: parseInt(fields.max_batches || "20"),
    enableNotifications: fields.enable_notifications === "true"
  };
}

// Manage cron jobs
// Cron jobs are handled by Heroku Scheduler - no local management needed

// Test AI integration
async function testAIIntegration(formData) {
  try {
    const testData = {
      orders_count: 5,
      co_purchases: { "123-456": 3, "456-789": 2 },
      product_frequency: { "123": 5, "456": 3, "789": 2 }
    };

    const aiResults = await callAIService(testData);
    
    return {
      success: true,
      test_data: testData,
      ai_results: aiResults
    };
  } catch (error) {
    console.error("❌ Error testing AI integration:", error);
    return {
      success: false,
      error: error.message
    };
  }
}
