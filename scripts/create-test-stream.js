/**
 * Script to create a test stream
 */
const axios = require('axios');

const createStream = async () => {
  try {
    const response = await axios.post('http://localhost:5004/api/streams/start', {
      title: 'Test Stream for Viewer Count',
      description: 'Testing real-time viewer count updates',
      category: 'Gaming',
      tags: ['test', 'viewers', 'realtime']
    });
    
    console.log('Stream created successfully:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error creating stream:', error.message);
  }
};

createStream();
