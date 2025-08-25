import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

// DigitalOcean Spaces configuration
const accessKeyId = 'DO8014G36CQCKEAQEYRJ';
const secretAccessKey = 'FdR3RelIxs9xgqOZIfP+cC59nadJzfSGx0zEIILZrrA';
const bucket = 'iadr-climate-refugee';
const region = 'nyc3';
const endpoint = `https://${region}.digitaloceanspaces.com`;

// Initialize S3 client
const s3Client = new S3Client({
  endpoint: endpoint,
  region: region,
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
  },
});

// CORS configuration
const corsConfiguration = {
  CORSRules: [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
      AllowedOrigins: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://*.vercel.app',
        'https://*.netlify.app'
      ],
      MaxAgeSeconds: 3000,
    },
  ],
};

async function configureCORS() {
  try {
    console.log('🔧 Configuring CORS for DigitalOcean Spaces bucket...');
    
    const command = new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: corsConfiguration,
    });
    
    await s3Client.send(command);
    
    console.log('✅ CORS configuration applied successfully!');
    console.log('📋 Allowed origins:', corsConfiguration.CORSRules[0].AllowedOrigins);
  } catch (error) {
    console.error('❌ Error configuring CORS:', error);
  }
}

configureCORS();
