// Simple test script to check metaobject creation
// Run this with: node test-metaobject.js

console.log("🧪 Testing metaobject creation...");

// Test the API endpoint directly
async function testAPI() {
    try {
        const url = 'http://localhost:3000/api/automation'; // or your tunnel URL
        console.log(`📡 Testing API at: ${url}`);
        
        const formData = new FormData();
        formData.append('action', 'createMetaobjectDefinitions');
        
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });
        
        console.log(`📊 Response status: ${response.status}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log("✅ Response data:", JSON.stringify(data, null, 2));
        } else {
            console.log("❌ Response not ok:", response.statusText);
        }
        
    } catch (error) {
        console.error("❌ Error testing API:", error.message);
    }
}

// Note: This won't work directly because it needs authentication
// But it shows the expected request format
console.log("📋 Expected request format:");
console.log("POST /api/automation");
console.log("Body: action=createMetaobjectDefinitions");
console.log("\n🔍 To debug:");
console.log("1. Try creating metaobject in your app");
console.log("2. Check terminal logs for the API calls");
console.log("3. Check browser Network tab for failed requests");

testAPI();
