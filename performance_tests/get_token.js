const https = require('https');
const fs = require('fs');
const path = require('path');

// Fill in your values here
const CLIENT_ID = '17bo0hl4cletfp84anpekeaf3s';
const USERNAME = 'lijunxianli341@gmail.com';
const PASSWORD = 'Test1234~';
const REGION = 'ap-southeast-1';

const body = JSON.stringify({
  AuthFlow: 'USER_PASSWORD_AUTH',
  ClientId: CLIENT_ID,
  AuthParameters: {
    USERNAME: USERNAME,
    PASSWORD: PASSWORD,
  },
});

const options = {
  hostname: `cognito-idp.${REGION}.amazonaws.com`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const parsed = JSON.parse(data);
    const token = parsed?.AuthenticationResult?.IdToken;
    if (token) {
      // Save token to token.txt in the same directory
      const outputPath = path.join(__dirname, 'token.txt');
      fs.writeFileSync(outputPath, token, 'utf8');
      console.log('✅ JWT Token retrieved and saved to token.txt');
      console.log(`   Path: ${outputPath}`);
      console.log('   Token expires in ~1 hour. Re-run this script before each test session.');
    } else {
      console.log('❌ Failed to retrieve token:', JSON.stringify(parsed, null, 2));
    }
  });
});

req.on('error', (err) => console.error('Request error:', err));
req.write(body);
req.end();