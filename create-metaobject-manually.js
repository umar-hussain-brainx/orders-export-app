// Manual Metaobject Creation Script
// Run this if the UI is stuck loading

import { authenticate } from "./app/shopify.server.js";

async function createMetaobjectManually() {
  try {
    console.log("🔧 Creating AI Analysis metaobject manually...");

    // You'll need to get admin from your session
    // This is a template - you'll need to adapt it
    const mutation = `
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
      }
    `;

    const variables = {
      definition: {
        name: "AI Analysis Results",
        type: "upsell_config",
        fieldDefinitions: [
          { key: "upsell_json_data", name: "Product Pairs JSON", type: "json" },
          { key: "alternative_upsells", name: "Alternative Pairs JSON", type: "json" },
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
    };

    console.log("GraphQL Mutation:", mutation);
    console.log("Variables:", JSON.stringify(variables, null, 2));
    console.log("\n📋 You can run this in GraphiQL or Shopify Admin API");
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

createMetaobjectManually();
