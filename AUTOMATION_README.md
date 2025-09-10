# 🤖 Quarterly AI-Powered Upsell Configuration System (Heroku)

This Shopify app runs quarterly on Heroku to analyze configurable periods of order data with AI, creating intelligent upsell configurations and recommendations that update a single existing Shopify upsell_config metaobject.

## 🚀 Features

### Core Functionality
- **Quarterly Processing**: Automatically processes configurable periods of order data (1, 3, 6, or 12 months)
- **AI Analysis**: Uses OpenAI/Claude to analyze purchase patterns and create product pairs
- **Smart Recommendations**: Generates frequently-bought-together pairs and trending products
- **Single Metaobject Update**: Updates existing metaobject instead of creating duplicates
- **Heroku Deployment**: Runs on Heroku with GitHub Actions triggering quarterly processing

### AI Capabilities
- **Product Pair Detection**: Identifies products frequently bought together
- **Trend Analysis**: Detects trending products based on purchase patterns
- **Cross-sell Opportunities**: Suggests complementary products
- **Customer Segmentation**: Analyzes customer purchase behaviors
- **Confidence Scoring**: Provides confidence scores for all recommendations

## 📋 Setup Instructions

### 1. Environment Variables
Create a `.env` file with the following variables:

```env
# Required for AI integration
OPENAI_API_KEY=sk-your-openai-key-here
# OR
CLAUDE_API_KEY=your-claude-key-here

# Optional settings
AUTOMATION_ENABLED=true
AI_CONFIDENCE_THRESHOLD=0.7
AI_MAX_BATCHES_PER_RUN=10
```

### 2. Install Dependencies
```bash
npm install node-cron
```

### 3. Shopify App Permissions
Ensure your app has these scopes in `shopify.app.toml`:
```toml
scopes = "write_products,read_products,read_orders,read_all_orders,read_customers,write_metaobjects,read_metaobjects"
```

### 4. Create Metaobject Definition
Use the "Setup" tab in the AI Automation Dashboard to create the required metaobject type:
- `upsell_config`: Single metaobject that stores all upsell configurations (updated monthly, no duplicates)

## 🎯 How It Works

### 1. Monthly Order Export (1 Month)
```javascript
// Automatically exports last 1 month of orders
const endDate = new Date();
const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000));
const orders = await exportOrdersFromShopify(admin, startDate, endDate);
```

### 2. AI Processing
```javascript
// Analyzes 1 month of order patterns with AI
const aiResults = await processOrdersWithAI(orders);
```

### 3. Update Existing Metaobject
```javascript
// Updates existing upsell_config metaobject instead of creating new ones
await updateMainAnalysisMetaobject(admin, aiResults);
```

## ⚙️ Configuration Options

### Scheduling
- **Monthly**: Process last 1 month of orders once per month (recommended)
- **Weekly**: Process last 1 month of orders once per week (for frequent updates)
- **Manual**: Only runs when triggered manually (always processes last 1 month)

### AI Providers
- **OpenAI GPT-4**: Recommended for best results
- **Claude**: Alternative AI provider
- **Custom API**: Use your own AI endpoint
- **Rule-based**: No AI, uses simple frequency analysis

## 🔧 API Endpoints

### Manual Processing
```bash
POST /api/automation
Content-Type: application/x-www-form-urlencoded

action=processOrders&startDate=2024-01-01T00:00:00Z&endDate=2024-01-02T00:00:00Z
```

### Test AI Integration
```bash
POST /api/automation
Content-Type: application/x-www-form-urlencoded

action=testAIIntegration
```

### Create Metaobjects
```bash
POST /api/automation
Content-Type: application/x-www-form-urlencoded

action=createMetaobjectDefinitions
```

## 📊 Data Structure

### Upsell Config Metaobject (Single Entry, Updated Monthly)
```javascript
{
  type: "upsell_config",
  fields: {
    upsell_json_data: "[{\"main_product\":\"123\",\"upsellVariants\":[{\"id\":\"456\"},{\"id\":\"789\"}]}]",
    alternative_upsells: "[{\"main_product\":\"123\",\"upsellVariants\":[{\"id\":\"999\"}]}]",
    trending_products: "[{\"product_id\":\"789\",\"trend_score\":0.92,\"reason\":\"High frequency\"}]",
    total_pairs_found: 15,
    total_trending_products: 8,
    confidence_threshold: 0.7,
    analysis_date: "2024-01-01T00:00:00Z",
    data_period: "1_month",
    fallback_used: false,
    last_updated: "2024-01-01T00:00:00Z"
  }
}
```

## 🔄 Cron Job Setup

### Using System Cron (Production)
```bash
# Edit crontab
crontab -e

# Monthly processing (recommended) - 1st of every month at 2 AM
0 2 1 * * curl -X POST https://your-app.com/api/automation -d "action=processOrders" -H "Authorization: Bearer YOUR_WEBHOOK_SECRET"

# Weekly alternative - Every Sunday at 2 AM (if you want more frequent updates)
0 2 * * 0 curl -X POST https://your-app.com/api/automation -d "action=processOrders" -H "Authorization: Bearer YOUR_WEBHOOK_SECRET"

# Note: Both automatically process the last 1 month of data and update the existing metaobject
```

### Using GitHub Actions (Alternative)
```yaml
name: Monthly AI Order Processing
on:
  schedule:
    - cron: '0 2 1 * *'  # Monthly on the 1st at 2 AM UTC
jobs:
  process-orders:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Monthly Processing
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/automation \
            -d "action=processOrders" \
            -H "Authorization: Bearer ${{ secrets.WEBHOOK_SECRET }}"
```

## 🐛 Troubleshooting

### Common Issues

1. **AI API Errors**
   - Check your API keys are correct
   - Verify you have credits/quota remaining
   - Check the console logs for detailed error messages

2. **Metaobject Creation Fails**
   - Ensure your app has `write_metaobjects` permission
   - Check if metaobject types already exist
   - Verify field definitions match the schema

3. **Order Export Issues**
   - Confirm `read_orders` and `read_all_orders` permissions
   - Check date range format (ISO 8601)
   - Verify orders exist in the specified date range

4. **Cron Jobs Not Running**
   - Check cron service is running: `sudo service cron status`
   - Verify crontab entries: `crontab -l`
   - Check webhook secret matches environment variable

### Debug Mode
Enable detailed logging by setting:
```env
LOG_LEVEL=debug
ENABLE_AUTOMATION_LOGS=true
```

## 📈 Performance Considerations

- **Rate Limiting**: Built-in delays between API calls (100ms default)
- **Batch Processing**: Processes up to 250 orders per batch
- **Memory Usage**: Processes orders in chunks to avoid memory issues
- **Error Recovery**: Continues processing even if individual orders fail
- **Fallback Logic**: Uses rule-based analysis if AI fails

## 🔒 Security

- **API Keys**: Store securely in environment variables
- **Webhook Secret**: Use strong random secret for cron job authentication
- **Permissions**: Only request necessary Shopify scopes
- **Data Privacy**: AI processing can be disabled for sensitive data

## 📚 Usage Examples

### Manual Processing via Dashboard
1. Navigate to "AI Automation" in the app
2. Go to "Overview" tab
3. Click "Run Manual Processing"
4. View results in "Results" tab

### Automated Daily Processing
1. Set schedule to "Daily" in Configuration
2. System automatically processes yesterday's orders at 2 AM
3. Results stored in metaobjects
4. View processing history in dashboard

### Custom Date Range Processing
1. Use the API endpoint with specific dates
2. Perfect for historical analysis or catching up missed periods
3. Supports up to 5000 orders per run (20 batches)

## 🚀 Heroku Deployment

### Quick Setup
```bash
# Run the automated deployment script
./deploy-heroku.sh

# Or deploy manually
heroku create your-orders-export-app
heroku addons:create heroku-postgresql:mini
git push heroku main
```

### GitHub Actions Setup
1. Go to your GitHub repo → Settings → Secrets and Variables → Actions
2. Add these secrets:
   - `APP_URL`: `https://your-orders-export-app.herokuapp.com`
   - `WEBHOOK_SECRET`: Your secure random token
   - `SHOPIFY_SHOP_DOMAIN`: `your-shop.myshopify.com`

### Quarterly Schedule
- **January 1st**: Process Oct-Dec data
- **April 1st**: Process Jan-Mar data  
- **July 1st**: Process Apr-Jun data
- **October 1st**: Process Jul-Sep data

### Monitoring
```bash
# View logs
heroku logs --tail -a your-app-name

# Check app status
heroku ps -a your-app-name

# View config
heroku config -a your-app-name
```

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Heroku logs: `heroku logs --tail`
3. Verify environment variables and permissions
4. Test with manual processing first before setting up cron jobs
