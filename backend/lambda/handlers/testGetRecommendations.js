import { getRecommendations } from './getRecommendations.js';

// Load your local .env file so the script has access to ONEMAP_EMAIL etc.
// Adjust the path based on where you put your .env file!
import dotenv from 'dotenv';
dotenv.config({ path: '../../cdk/.env' }); 

const mockBody = {
  venueType: "Cafe",
  // Let's test with 3 friends spread across Singapore!
  users: [
    { 
      id: "alice", 
      transportType: "Public Transport", 
      coordinates: { lat: 1.3329, lng: 103.7436 } // Jurong East
    },
    { 
      id: "bob", 
      transportType: "Car", 
      coordinates: { lat: 1.3521, lng: 103.9433 } // Tampines
    },
    { 
      id: "charlie", 
      transportType: "Public Transport", 
      coordinates: { lat: 1.4382, lng: 103.7890 } // Woodlands
    }
  ]
};

async function runTest() {
  console.log("🚀 Starting Recommendation Engine...");
  console.log(`Searching for: ${mockBody.venueType} for ${mockBody.users.length} users\n`);
  
  try {
    const startTime = Date.now();
    
    // Execute your function
    const results = await getRecommendations(mockBody);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`✅ Success! Finished in ${duration} seconds.\n`);
    
    // Print the results beautifully formatted
    console.log(JSON.stringify(results, null, 2));
    
  } catch (error) {
    console.error("❌ Test Failed:", error.message);
  }
}

runTest();