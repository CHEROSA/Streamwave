/**
 * Script to display live streams
 */
const axios = require('axios');

async function displayLiveStreams() {
  try {
    const response = await axios.get('http://localhost:5004/api/streams/live');
    
    console.log('Live Streams:');
    console.log('=============');
    
    if (response.data.streams && response.data.streams.length > 0) {
      response.data.streams.forEach((stream, index) => {
        console.log(`Stream #${index + 1}:`);
        console.log(`- ID: ${stream.id}`);
        console.log(`- Title: ${stream.title}`);
        console.log(`- Description: ${stream.description}`);
        console.log(`- Category: ${stream.category}`);
        console.log(`- Tags: ${stream.tags.join(', ')}`);
        console.log(`- Status: ${stream.status}`);
        console.log(`- Started At: ${new Date(stream.startTime).toLocaleString()}`);
        console.log(`- RTMP URL: ${stream.rtmpUrl}`);
        console.log(`- Stream Key: ${stream.rtmpUrl.split('/').pop()}`);
        console.log('---');
      });
      
      // Also print the full response
      console.log('\nFull Response:');
      console.log(JSON.stringify(response.data, null, 2));
    } else {
      console.log('No live streams found.');
    }
  } catch (error) {
    console.error('Error fetching live streams:', error.message);
  }
}

// Execute the function
displayLiveStreams();
