import { useState, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  Text,
  InlineStack,
  Select,
  TextField,
  Banner,
  DataTable,
  Badge,
  Box,
  Divider,
  Icon,
  Spinner,
  ProgressBar,
  Tabs,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  // This will proxy to the automation API
  const formData = await request.formData();
  
  // Forward to automation API
  const automationRequest = new Request(
    new URL("/api/automation", request.url).toString(),
    {
      method: "POST",
      body: formData,
      headers: request.headers,
    }
  );
  
  const response = await fetch(automationRequest);
  return await response.json();
};

export default function AutomationDashboard() {
  const fetcher = useFetcher();
  const [activeTab, setActiveTab] = useState(0);
  const [automationStatus, setAutomationStatus] = useState("idle");
  const [lastResults, setLastResults] = useState(null);
  const [config, setConfig] = useState({
    schedule: "hourly",
    aiProvider: "openai",
    confidenceThreshold: 0.7,
    maxBatches: 10,
    enableNotifications: true
  });

  const isLoading = fetcher.state === "submitting";

  // Handle automation actions
  const handleAction = (action, data = {}) => {
    const formData = new FormData();
    formData.append("action", action);
    
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value.toString());
    });
    
    fetcher.submit(formData, { method: "POST" });
  };

  // Setup metaobject definitions
  const setupMetaobjects = () => {
    handleAction("createMetaobjectDefinitions");
  };

  // Test AI integration
  const testAI = () => {
    handleAction("testAIIntegration");
  };

  // Run manual processing
  const runManualProcessing = () => {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 1 month ago
    
    handleAction("processOrders", {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      setLastResults(fetcher.data);
      setAutomationStatus("completed");
    } else if (fetcher.data?.success === false) {
      setAutomationStatus("error");
    }
  }, [fetcher.data]);

  const tabs = [
    {
      id: "overview",
      content: "Overview",
      panelID: "overview-panel"
    },
    {
      id: "configuration",
      content: "Configuration", 
      panelID: "config-panel"
    },
    {
      id: "results",
      content: "Results",
      panelID: "results-panel"
    },
    {
      id: "setup",
      content: "Setup",
      panelID: "setup-panel"
    }
  ];

  const scheduleOptions = [
    { label: "Monthly (Recommended)", value: "monthly" },
    { label: "Weekly", value: "weekly" },
    { label: "Manual Only", value: "manual" }
  ];

  const aiProviderOptions = [
    { label: "OpenAI GPT-4", value: "openai" },
    { label: "Claude", value: "claude" },
    { label: "Custom API", value: "custom" },
    { label: "Rule-based (No AI)", value: "rules" }
  ];

  return (
    <Page>
      <TitleBar title="AI Automation Dashboard" />
      <BlockStack gap="500">
        <Banner 
          status="info" 
          title="Monthly AI Analysis - 1 Month Data Processing"
        >
          <p>
            This system runs monthly to analyze the last 1 month of order data with AI, creating product pairs and 
            recommendations that update your existing metaobject entry. No duplicate entries are created.
          </p>
        </Banner>

        <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab}>
          {/* Overview Tab */}
          {activeTab === 0 && (
            <Layout>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Automation Status
                    </Text>
                    
                    <InlineStack gap="300" align="start">
                      <Badge 
                        status={automationStatus === "completed" ? "success" : 
                               automationStatus === "error" ? "critical" : 
                               automationStatus === "running" ? "info" : "attention"}
                      >
                        {automationStatus.toUpperCase()}
                      </Badge>
                      
                      {isLoading && <Spinner size="small" />}
                    </InlineStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text as="h3" variant="headingMd">Quick Actions</Text>
                      
                      <InlineStack gap="300">
                        <Button 
                          primary 
                          loading={isLoading}
                          onClick={runManualProcessing}
                        >
                          Run Manual Processing
                        </Button>
                        
                        <Button 
                          onClick={testAI}
                          loading={isLoading}
                        >
                          Test AI Integration
                        </Button>
                        
                        <Button 
                          onClick={setupMetaobjects}
                          loading={isLoading}
                        >
                          Setup Metaobjects
                        </Button>
                      </InlineStack>
                    </BlockStack>

                    {lastResults && (
                      <>
                        <Divider />
                        <BlockStack gap="300">
                          <Text as="h3" variant="headingMd">Last Processing Results</Text>
                          <Box padding="400" background="bg-surface-active" borderRadius="200">
                            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                              {JSON.stringify(lastResults, null, 2)}
                            </pre>
                          </Box>
                        </BlockStack>
                      </>
                    )}

                    {fetcher.data?.success === false && (
                      <Banner status="critical" title="Processing Error">
                        <p>{fetcher.data.error}</p>
                      </Banner>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <BlockStack gap="500">
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">System Features</Text>
                      <List>
                        <List.Item>Monthly automated processing (1 month data)</List.Item>
                        <List.Item>AI-powered product pair analysis</List.Item>
                        <List.Item>Trend detection and recommendations</List.Item>
                        <List.Item>Updates existing metaobject (no duplicates)</List.Item>
                        <List.Item>Comprehensive 1-month data analysis</List.Item>
                        <List.Item>Multiple AI provider support</List.Item>
                      </List>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">Processing Stats</Text>
                      <DataTable
                        columnContentTypes={['text', 'text']}
                        headings={['Metric', 'Value']}
                        rows={[
                          ['Last Run', lastResults?.timestamp ? new Date(lastResults.timestamp).toLocaleString() : 'Never'],
                          ['Orders Processed', lastResults?.processed_orders?.toString() || '0'],
                          ['Pairs Found', lastResults?.ai_results?.product_pairs?.length?.toString() || '0'],
                          ['Trending Products', lastResults?.ai_results?.trending_products?.length?.toString() || '0'],
                          ['Status', automationStatus]
                        ]}
                      />
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Layout.Section>
            </Layout>
          )}

          {/* Configuration Tab */}
          {activeTab === 1 && (
            <Layout>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Automation Configuration
                    </Text>

                    <BlockStack gap="300">
                      <InlineStack gap="300" align="start">
                        <div style={{ minWidth: "200px" }}>
                          <Select
                            label="Processing Schedule"
                            options={scheduleOptions}
                            value={config.schedule}
                            onChange={(value) => setConfig(prev => ({ ...prev, schedule: value }))}
                          />
                        </div>
                        
                        <div style={{ minWidth: "200px" }}>
                          <Select
                            label="AI Provider"
                            options={aiProviderOptions}
                            value={config.aiProvider}
                            onChange={(value) => setConfig(prev => ({ ...prev, aiProvider: value }))}
                          />
                        </div>
                      </InlineStack>

                      <InlineStack gap="300" align="start">
                        <TextField
                          label="Confidence Threshold (0.0 - 1.0)"
                          type="number"
                          value={config.confidenceThreshold.toString()}
                          onChange={(value) => setConfig(prev => ({ 
                            ...prev, 
                            confidenceThreshold: parseFloat(value) || 0.7 
                          }))}
                          min="0"
                          max="1"
                          step="0.1"
                        />
                        
                        <TextField
                          label="Max Batches per Run"
                          type="number"
                          value={config.maxBatches.toString()}
                          onChange={(value) => setConfig(prev => ({ 
                            ...prev, 
                            maxBatches: parseInt(value) || 10 
                          }))}
                          min="1"
                          max="50"
                        />
                      </InlineStack>

                      <Button primary>Save Configuration</Button>
                    </BlockStack>
                  </BlockStack>
                </Card>

                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      Environment Variables
                    </Text>
                    
                    <Text variant="bodyMd" as="p">
                      Make sure these environment variables are configured:
                    </Text>

                    <Box padding="400" background="bg-surface-active" borderRadius="200">
                      <pre style={{ fontSize: '12px' }}>
{`# Required for AI integration
OPENAI_API_KEY=your_openai_api_key_here
CLAUDE_API_KEY=your_claude_api_key_here

# Optional: Custom AI endpoint
CUSTOM_AI_ENDPOINT=https://your-ai-api.com
CUSTOM_AI_KEY=your_custom_api_key

# Cron job settings (if using external cron)
AUTOMATION_WEBHOOK_SECRET=your_webhook_secret
AUTOMATION_ENABLED=true`}
                      </pre>
                    </Box>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Schedule Information</Text>
                    <Text variant="bodyMd" as="p">
                      <strong>Monthly:</strong> Processes last 1 month of orders once per month (recommended)
                    </Text>
                    <Text variant="bodyMd" as="p">
                      <strong>Weekly:</strong> Processes last 1 month of orders once per week (for frequent updates)
                    </Text>
                    <Text variant="bodyMd" as="p">
                      <strong>Manual:</strong> Only runs when triggered manually (processes last 1 month)
                    </Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          )}

          {/* Results Tab */}
          {activeTab === 2 && (
            <Layout>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      AI Analysis Results
                    </Text>

                    {lastResults?.ai_results ? (
                      <BlockStack gap="400">
                        {/* Product Pairs */}
                        {lastResults.ai_results.product_pairs?.length > 0 && (
                          <>
                            <Text as="h3" variant="headingMd">
                              Product Pairs ({lastResults.ai_results.product_pairs.length})
                            </Text>
                            <DataTable
                              columnContentTypes={['text', 'text', 'numeric', 'numeric', 'text']}
                              headings={['Product 1', 'Product 2', 'Confidence', 'Frequency', 'Type']}
                              rows={lastResults.ai_results.product_pairs.slice(0, 10).map(pair => [
                                pair.product_1_id,
                                pair.product_2_id,
                                pair.confidence_score?.toFixed(2) || 'N/A',
                                pair.frequency?.toString() || 'N/A',
                                pair.recommendation_type || 'N/A'
                              ])}
                            />
                          </>
                        )}

                        {/* Trending Products */}
                        {lastResults.ai_results.trending_products?.length > 0 && (
                          <>
                            <Text as="h3" variant="headingMd">
                              Trending Products ({lastResults.ai_results.trending_products.length})
                            </Text>
                            <DataTable
                              columnContentTypes={['text', 'numeric', 'text']}
                              headings={['Product ID', 'Trend Score', 'Reason']}
                              rows={lastResults.ai_results.trending_products.slice(0, 10).map(product => [
                                product.product_id,
                                product.trend_score?.toFixed(2) || 'N/A',
                                product.reason || 'N/A'
                              ])}
                            />
                          </>
                        )}

                        {/* Summary */}
                        {lastResults.ai_results.summary && (
                          <>
                            <Text as="h3" variant="headingMd">Analysis Summary</Text>
                            <Box padding="400" background="bg-surface-active" borderRadius="200">
                              <pre style={{ fontSize: '12px' }}>
                                {JSON.stringify(lastResults.ai_results.summary, null, 2)}
                              </pre>
                            </Box>
                          </>
                        )}
                      </BlockStack>
                    ) : (
                      <Banner status="info" title="No Results Available">
                        <p>Run the automation to see AI analysis results here.</p>
                      </Banner>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">Metaobject Storage</Text>
                    <Text variant="bodyMd" as="p">
                      Results are automatically stored in a single metaobject:
                    </Text>
                    <List>
                      <List.Item><strong>ai_analysis:</strong> Contains all AI results (product pairs, trending products, analysis summary)</List.Item>
                      <List.Item><strong>Updates monthly:</strong> Same entry is updated, no duplicates created</List.Item>
                      <List.Item><strong>1-month data:</strong> Analysis based on last 1 month of orders</List.Item>
                    </List>
                    
                    {lastResults?.metaobject_results && (
                      <>
                        <Divider />
                        <Text as="h3" variant="headingMd">Last Storage Results</Text>
                        <Text variant="bodyMd" as="p">
                          Stored {lastResults.metaobject_results.stored_objects} objects successfully
                        </Text>
                      </>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          )}

          {/* Setup Tab */}
          {activeTab === 3 && (
            <Layout>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">
                      System Setup
                    </Text>

                    <BlockStack gap="400">
                      <Banner status="warning" title="Setup Required">
                        <p>Complete these setup steps to enable full automation functionality.</p>
                      </Banner>

                      <BlockStack gap="300">
                        <Text as="h3" variant="headingMd">1. Create AI Analysis Metaobject</Text>
                        <Text variant="bodyMd" as="p">
                          Create a single metaobject type called "ai_analysis" to store all AI results. This will be updated monthly with new data.
                        </Text>
                        <Button onClick={setupMetaobjects} loading={isLoading}>
                          Create AI Analysis Metaobject
                        </Button>
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="h3" variant="headingMd">2. Configure Environment Variables</Text>
                        <Text variant="bodyMd" as="p">
                          Add your AI API keys and configuration to your environment variables.
                        </Text>
                        <Box padding="400" background="bg-surface-active" borderRadius="200">
                          <pre style={{ fontSize: '12px' }}>
{`# Add to your .env file:
OPENAI_API_KEY=sk-your-openai-key-here
CLAUDE_API_KEY=your-claude-key-here
AUTOMATION_ENABLED=true`}
                          </pre>
                        </Box>
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="h3" variant="headingMd">3. Test AI Integration</Text>
                        <Text variant="bodyMd" as="p">
                          Verify that your AI service is working correctly with test data.
                        </Text>
                        <Button onClick={testAI} loading={isLoading}>
                          Test AI Integration
                        </Button>
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="300">
                        <Text as="h3" variant="headingMd">4. Set Up Cron Jobs (Optional)</Text>
                        <Text variant="bodyMd" as="p">
                          For production deployment, set up external cron jobs to trigger automation:
                        </Text>
                        <Box padding="400" background="bg-surface-active" borderRadius="200">
                          <pre style={{ fontSize: '12px' }}>
{`# Monthly cron job (recommended):
# Runs on the 1st of every month at 2 AM
0 2 1 * * curl -X POST https://your-app.com/api/automation \\
  -d "action=processOrders" \\
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET"

# Weekly alternative (if you want more frequent updates):
# Runs every Sunday at 2 AM
0 2 * * 0 curl -X POST https://your-app.com/api/automation \\
  -d "action=processOrders" \\
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET"

# Note: Both process last 1 month of data and update the same metaobject`}
                          </pre>
                        </Box>
                      </BlockStack>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <BlockStack gap="500">
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">Setup Checklist</Text>
                      <List>
                        <List.Item>✅ Shopify app installed and configured</List.Item>
                        <List.Item>⏳ Metaobject definitions created</List.Item>
                        <List.Item>⏳ AI API keys configured</List.Item>
                        <List.Item>⏳ Test AI integration successful</List.Item>
                        <List.Item>⏳ Cron jobs configured (optional)</List.Item>
                      </List>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">Need Help?</Text>
                      <Text variant="bodyMd" as="p">
                        Check the console logs for detailed error messages and debugging information.
                      </Text>
                      <Text variant="bodyMd" as="p">
                        Make sure your Shopify app has the required permissions: read_orders, read_all_orders, write_metaobjects.
                      </Text>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Layout.Section>
            </Layout>
          )}
        </Tabs>
      </BlockStack>
    </Page>
  );
}
