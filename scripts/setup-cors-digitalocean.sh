#!/bin/bash

# DigitalOcean Spaces CORS Configuration Script
# This configures CORS to allow uploads from your web app

ACCESS_KEY="DO8014G36CQCKEAQEYRJ"
SECRET_KEY="FdR3RelIxs9xgqOZIfP+cC59nadJzfSGx0zEIILZrrA"
BUCKET="iadr-climate-refugee"
REGION="nyc3"
ENDPOINT="https://${REGION}.digitaloceanspaces.com"

# Create CORS configuration
cat > cors-config.json << EOF
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": [
        "http://localhost:5173",
        "http://localhost:5174", 
        "http://localhost:3000",
        "https://localhost:5173",
        "https://localhost:5174",
        "https://localhost:3000"
      ],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF

# Use s3cmd to set CORS (install with: pip install s3cmd)
s3cmd --access_key=$ACCESS_KEY \
      --secret_key=$SECRET_KEY \
      --host=$ENDPOINT \
      --host-bucket="%(bucket)s.${REGION}.digitaloceanspaces.com" \
      setcors cors-config.json s3://$BUCKET

echo "CORS configuration applied to $BUCKET"
