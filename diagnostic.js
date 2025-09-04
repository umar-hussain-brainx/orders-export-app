#!/usr/bin/env node

console.log("🔍 Orders Export App - Diagnostic Script");
console.log("==========================================");

// Check Node.js version
console.log(`📋 Node.js version: ${process.version}`);

// Check if required files exist
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requiredFiles = [
  'package.json',
  'shopify.app.toml',
  'app/routes/app.automation.jsx',
  'app/routes/api.automation.jsx',
  'app/routes/app.orders.jsx',
  'app/services/cronService.js',
  'prisma/schema.prisma'
];

console.log("\n📁 Checking required files:");
requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`${exists ? '✅' : '❌'} ${file}`);
});

// Check .env file
const envExists = fs.existsSync(path.join(__dirname, '.env'));
console.log(`\n🔧 Environment file: ${envExists ? '✅ .env exists' : '❌ .env missing'}`);

if (envExists) {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const requiredEnvVars = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'DATABASE_URL'];
  
  console.log("\n🔑 Environment variables:");
  requiredEnvVars.forEach(envVar => {
    const exists = envContent.includes(envVar);
    console.log(`${exists ? '✅' : '❌'} ${envVar}`);
  });
}

// Check package.json
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  console.log(`\n📦 App name: ${packageJson.name}`);
  console.log(`📦 Version: ${packageJson.version}`);
  
  // Check key dependencies
  const keyDeps = ['@shopify/shopify-app-remix', '@shopify/polaris', 'node-cron'];
  console.log("\n📚 Key dependencies:");
  keyDeps.forEach(dep => {
    const exists = packageJson.dependencies && packageJson.dependencies[dep];
    console.log(`${exists ? '✅' : '❌'} ${dep}${exists ? ` (${packageJson.dependencies[dep]})` : ''}`);
  });
} catch (error) {
  console.log("❌ Error reading package.json:", error.message);
}

// Check Shopify config
try {
  const tomlContent = fs.readFileSync(path.join(__dirname, 'shopify.app.toml'), 'utf8');
  const hasScopes = tomlContent.includes('read_orders');
  const hasMetaobjects = tomlContent.includes('metaobjects');
  
  console.log("\n🛍️ Shopify configuration:");
  console.log(`${hasScopes ? '✅' : '❌'} Order access scopes`);
  console.log(`${hasMetaobjects ? '✅' : '❌'} Metaobject access scopes`);
  
  // Extract client_id
  const clientIdMatch = tomlContent.match(/client_id = "([^"]+)"/);
  if (clientIdMatch) {
    console.log(`🔑 Client ID: ${clientIdMatch[1]}`);
  }
} catch (error) {
  console.log("❌ Error reading shopify.app.toml:", error.message);
}

// Check database
const dbPath = path.join(__dirname, 'prisma/dev.sqlite');
const dbExists = fs.existsSync(dbPath);
console.log(`\n💾 Database: ${dbExists ? '✅ SQLite database exists' : '❌ Database missing'}`);

console.log("\n🚀 Next Steps:");
if (!envExists) {
  console.log("1. Create .env file with required variables");
}
console.log("2. Run: npm install");
console.log("3. Run: npm run dev");
console.log("4. Test basic functionality");

console.log("\n📖 For detailed troubleshooting, see TROUBLESHOOTING.md");
