const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const services = [
  'auth',
  'catalog',
  'inventory',
  'notification',
  'order',
  'payment',
  'read-model',
  'ticket'
];

// Default values matching 00-az-variables.cmd if env vars are missing
const PROJECT_NAME = process.env.AZ_PROJECT_NAME || 'eventix-mw2';
const ENVIRONMENT = process.env.AZ_ENVIRONMENT || 'prod';

console.log(`Deploying microservices for ${PROJECT_NAME} (${ENVIRONMENT})...`);

let hasErrors = false;

for (const service of services) {
  const appName = `${PROJECT_NAME}-${service}-api-${ENVIRONMENT}`;
  const servicePath = path.join(__dirname, `../azure/services/${service}-service`);
  
  if (!fs.existsSync(servicePath)) {
      console.error(`Service path not found: ${servicePath}`);
      continue;
  }

  console.log(`\n--------------------------------------------------`);
  console.log(`Deploying ${service} service to ${appName}...`);
  console.log(`Path: ${servicePath}`);
  console.log(`--------------------------------------------------\n`);

  try {
    // Install dependencies first (pruning dev dependencies for smaller package)
    console.log(`Installing dependencies for ${service}...`);
    execSync('npm install', { cwd: servicePath, stdio: 'inherit' });
    execSync('npm run build', { cwd: servicePath, stdio: 'inherit' });
    execSync('npm prune --production', { cwd: servicePath, stdio: 'inherit' });

    // Deploy
    console.log(`Publishing to Azure Function App: ${appName}...`);
    execSync(`func azure functionapp publish ${appName} --javascript`, { cwd: servicePath, stdio: 'inherit' });
    
    console.log(`\nSuccessfully deployed ${service}.`);
  } catch (error) {
    console.error(`\nFailed to deploy ${service}:`, error.message);
    hasErrors = true;
  }
}

if (hasErrors) {
    console.error('\nDeployment finished with errors.');
    process.exit(1);
} else {
    console.log('\nAll services deployed successfully.');
}
