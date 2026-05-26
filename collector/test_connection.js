/**
 * Connection Test Script
 * Use this to simulate a workstation sending a log to the collector.
 */

const axios = require('axios'); // Note: user will need to run 'npm install axios' or use fetch

const testLog = {
  machine_id: "TEST-WORKSTATION",
  username: "test.user@company.com",
  domain: "facebook.com",
  full_url: "https://www.facebook.com/messages",
  timestamp: new Date().toISOString(),
  violation: true
};

async function runTest() {
  console.log("🚀 Attempting to send test log to http://localhost:3000/logs...");
  
  try {
    const response = await fetch('http://localhost:3000/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testLog)
    });

    if (response.ok) {
      console.log("✅ Success! Log received by collector.");
    } else {
      console.error("❌ Failed. Server responded with:", response.status);
    }
  } catch (error) {
    console.error("❌ Connection Error. Is the server running? ", error.message);
  }
}

runTest();
