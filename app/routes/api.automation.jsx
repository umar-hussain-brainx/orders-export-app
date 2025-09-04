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
    // Always process last 1 month of data
    const endDate = formData.get("endDate") || new Date().toISOString();
    const startDate = formData.get("startDate") || new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString(); // 1 month ago
    
    console.log(`🔄 Processing orders from ${startDate} to ${endDate}`);

    // 1. Export orders from Shopify
    const orders = await exportOrdersFromShopify(admin, startDate, endDate);
    
    if (orders.length === 0) {
      return { success: true, message: "No new orders to process", orders: [] };
    }

    console.log(`📦 Found ${orders.length} orders to process`);

    // 2. Process with AI
    const aiResults = await processOrdersWithAI(orders);

    // 3. Store results in metaobjects
    const metaobjectResults = await storeResultsInMetaobjects(admin, aiResults);

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
      product_pairs: [],
      customer_recommendations: [],
      trending_products: [],
      cross_sell_opportunities: [],
      summary: {
        total_orders: orders.length,
        unique_products: new Set(orders.flatMap(o => o.line_items.map(i => i.product_id))).size,
        processed_at: new Date().toISOString()
      }
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
Analyze this e-commerce data and create product recommendations:

Orders analyzed: ${data.orders_count}
Top co-purchased product pairs: ${JSON.stringify(topCoPurchases)}
Most popular products: ${JSON.stringify(topProducts)}

Please return ONLY valid JSON with this exact structure:
{
  "product_pairs": [
    {
      "product_1_id": "123",
      "product_2_id": "456", 
      "confidence_score": 0.85,
      "frequency": 15,
      "recommendation_type": "frequently_bought_together"
    }
  ],
  "trending_products": [
    {
      "product_id": "789",
      "trend_score": 0.92,
      "reason": "High purchase frequency"
    }
  ],
  "cross_sell_opportunities": [
    {
      "base_product_id": "123",
      "recommended_product_id": "456",
      "confidence": 0.78,
      "reason": "Complementary products"
    }
  ],
  "summary": {
    "total_pairs_found": 5,
    "confidence_threshold": 0.7,
    "analysis_date": "${new Date().toISOString()}"
  }
}
`;
}

// Create fallback response when AI fails
function createFallbackResponse(data) {
  const topCoPurchases = Object.entries(data.co_purchases)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([pair, frequency]) => {
      const [product1, product2] = pair.split('-');
      return {
        product_1_id: product1,
        product_2_id: product2,
        confidence_score: Math.min(0.9, frequency / 10),
        frequency,
        recommendation_type: "frequently_bought_together"
      };
    });

  const topProducts = Object.entries(data.product_frequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([productId, frequency]) => ({
      product_id: productId,
      trend_score: Math.min(0.9, frequency / 20),
      reason: "High purchase frequency"
    }));

  return {
    product_pairs: topCoPurchases,
    trending_products: topProducts,
    cross_sell_opportunities: [],
    summary: {
      total_pairs_found: topCoPurchases.length,
      confidence_threshold: 0.7,
      analysis_date: new Date().toISOString(),
      fallback_used: true
    }
  };
}

// Store AI results in Shopify metaobjects (update existing entries)
async function storeResultsInMetaobjects(admin, aiResults) {
  try {
    console.log("💾 Updating AI results in existing metaobjects...");

    const results = [];

    // Update the single main metaobject with all AI results
    const mainMetaobject = await updateMainAnalysisMetaobject(admin, aiResults);
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

// Update main analysis metaobject with all AI results
async function updateMainAnalysisMetaobject(admin, aiResults) {
  try {
    // First, try to find existing metaobject
    const existingMetaobject = await findExistingAnalysisMetaobject(admin);
    
    const analysisData = {
      product_pairs: JSON.stringify(aiResults.product_pairs || []),
      trending_products: JSON.stringify(aiResults.trending_products || []),
      cross_sell_opportunities: JSON.stringify(aiResults.cross_sell_opportunities || []),
      total_pairs_found: (aiResults.product_pairs?.length || 0).toString(),
      total_trending_products: (aiResults.trending_products?.length || 0).toString(),
      confidence_threshold: (aiResults.summary?.confidence_threshold || 0.7).toString(),
      analysis_date: new Date().toISOString(),
      data_period: "1_month",
      fallback_used: (aiResults.summary?.fallback_used || false).toString(),
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
          metaobjects(type: "ai_analysis", first: 1) {
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
          type: "ai_analysis",
          fields: fields
        }
      }
    }
  );

  return await response.json();
}

// Create single comprehensive metaobject definition for AI analysis
async function createMetaobjectDefinitions(admin) {
  try {
    console.log("🔧 Starting metaobject definition creation...");
    
    // Create single AI Analysis metaobject definition
    const aiAnalysisDef = await admin.graphql(
      `#graphql
        mutation createAIAnalysisDefinition($definition: MetaobjectDefinitionCreateInput!) {
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
            name: "AI Analysis Results",
            type: "ai_analysis",
            fieldDefinitions: [
              { key: "product_pairs", name: "Product Pairs JSON", type: "multi_line_text_field" },
              { key: "trending_products", name: "Trending Products JSON", type: "multi_line_text_field" },
              { key: "cross_sell_opportunities", name: "Cross-sell Opportunities JSON", type: "multi_line_text_field" },
              { key: "total_pairs_found", name: "Total Pairs Found", type: "number_integer" },
              { key: "total_trending_products", name: "Total Trending Products", type: "number_integer" },
              { key: "confidence_threshold", name: "Confidence Threshold", type: "number_decimal" },
              { key: "analysis_date", name: "Analysis Date", type: "date_time" },
              { key: "data_period", name: "Data Period", type: "single_line_text_field" },
              { key: "fallback_used", name: "Fallback Used", type: "boolean" },
              { key: "last_updated", name: "Last Updated", type: "date_time" }
            ]
          }
        }
      }
    );
    
    console.log("📡 GraphQL request sent, processing response...");
    const result = await aiAnalysisDef.json();
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
      console.log("✅ Metaobject definition created successfully!");
      return {
        success: true,
        definition: result.data.metaobjectDefinitionCreate.metaobjectDefinition,
        message: "✅ AI Analysis metaobject definition created successfully!"
      };
    }

    // If we get here, something unexpected happened
    console.error("⚠️ Unexpected response structure:", result);
    return {
      success: false,
      error: "Unexpected response from Shopify API"
    };

  } catch (error) {
    console.error("❌ Error creating metaobject definition:", error);
    return {
      success: false,
      error: `Creation failed: ${error.message}`
    };
  }
}

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
