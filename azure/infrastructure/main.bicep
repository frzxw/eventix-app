// Eventix - Azure Functions Backend Infrastructure
// Simplified Bicep template focusing on Azure Functions, PostgreSQL, Redis, Service Bus, and Storage

param location string = 'southeastasia'
param environment string = 'prod'
param projectName string = 'eventix'
param deployStaticWebApp bool = true
param staticWebAppSkuTier string = 'Standard'
param staticWebAppSkuName string = 'Standard'
param staticWebAppLocation string = 'eastasia'

@secure()
param sqlAdminUser string = 'eventix_admin'
@secure()
param sqlAdminPassword string
param deployerObjectId string = ''

// Generate unique suffix for global resources
var uniqueSuffix = substring(uniqueString(resourceGroup().id), 0, 6)
var projectNameClean = toLower(replace(projectName, '-', ''))

// Resource naming
var storageAccountName = '${projectNameClean}store${uniqueSuffix}'
var staticWebAppName = '${projectName}-app-${environment}'
var sqlServerName = '${projectName}-sql-${environment}'
var sqlDatabaseName = '${projectName}-db'
var cosmosAccountName = '${projectName}-cosmos-${environment}'
var keyVaultName = '${projectName}-kv-${environment}'
var cacheForRedisName = '${projectName}-cache-${environment}'
var serviceBusName = '${projectName}-sb-${environment}'
var appInsightsName = '${projectName}-insights-${environment}'
var logAnalyticsWorkspaceName = '${projectName}-law-${environment}'
var functionStorageAccountName = '${projectNameClean}func${uniqueSuffix}'
var appServicePlanName = '${projectName}-plan-${environment}'

var keyVaultInitialPolicies = deployerObjectId == '' ? [] : [
  {
    tenantId: subscription().tenantId
    objectId: deployerObjectId
    permissions: {
      secrets: [
        'get'
        'list'
        'set'
      ]
    }
  }
]

// ==================== Storage Account for Blob Storage ====================
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// Blob containers for event images and QR codes
resource eventImagesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/event-images'
  properties: {
    publicAccess: 'None'
  }
}

resource qrCodesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/qr-codes'
  properties: {
    publicAccess: 'None'
  }
}

// ==================== Azure Static Web App ====================
resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = if (deployStaticWebApp) {
  name: staticWebAppName
  location: staticWebAppLocation
  sku: {
    name: staticWebAppSkuName
    tier: staticWebAppSkuTier
  }
  properties: {
    enterpriseGradeCdnStatus: 'Disabled'
    stagingEnvironmentPolicy: 'Enabled'
  }
}

// ==================== Azure SQL Database ====================
resource sqlServer 'Microsoft.Sql/servers@2022-05-01-preview' = {
  name: sqlServerName
  location: location
  properties: {
    administratorLogin: sqlAdminUser
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    publicNetworkAccess: 'Enabled'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2022-05-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 10
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 268435456000
  }
}

resource sqlFirewallAzure 'Microsoft.Sql/servers/firewallRules@2022-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ==================== Cosmos DB ====================
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosAccount
  name: 'eventix-db'
  properties: {
    resource: {
      id: 'eventix-db'
    }
  }
}

resource eventsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'events'
  properties: {
    resource: {
      id: 'events'
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
    }
  }
}

resource ticketCategoriesContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'ticketCategories'
  properties: {
    resource: {
      id: 'ticketCategories'
      partitionKey: {
        paths: ['/partitionKey']
        kind: 'Hash'
      }
    }
  }
}

resource reservationsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'reservations'
  properties: {
    resource: {
      id: 'reservations'
      partitionKey: {
        paths: ['/partitionKey']
        kind: 'Hash'
      }
      defaultTtl: 600 // 10 minutes default TTL for transient reservations
    }
  }
}

resource ordersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'orders'
  properties: {
    resource: {
      id: 'orders'
      partitionKey: {
        paths: ['/userId']
        kind: 'Hash'
      }
    }
  }
}

resource ticketsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'tickets'
  properties: {
    resource: {
      id: 'tickets'
      partitionKey: {
        paths: ['/orderId']
        kind: 'Hash'
      }
    }
  }
}

resource idempotencyContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: cosmosDatabase
  name: 'idempotency'
  properties: {
    resource: {
      id: 'idempotency'
      partitionKey: {
        paths: ['/idempotencyKey']
        kind: 'Hash'
      }
      defaultTtl: 86400 // 24 hours
    }
  }
}

// ==================== Key Vault ====================
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    enabledForDeployment: true
    enabledForTemplateDeployment: true
    enabledForDiskEncryption: false
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    accessPolicies: keyVaultInitialPolicies
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

// ==================== Azure Cache for Redis ====================
resource cacheForRedis 'Microsoft.Cache/redis@2023-08-01' = {
  name: cacheForRedisName
  location: location
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// ==================== Service Bus ====================
resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: serviceBusName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// Queues
resource orderCreatedQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'order-created'
  properties: {
    lockDuration: 'PT30S'
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    requiresSession: false
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    maxDeliveryCount: 10
    enableBatchedOperations: true
  }
}

resource paymentConfirmedQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'payment-confirmed'
  properties: {
    lockDuration: 'PT30S'
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    requiresSession: false
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    maxDeliveryCount: 10
    enableBatchedOperations: true
  }
}

resource ticketIssuedQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'ticket-issued'
  properties: {
    lockDuration: 'PT30S'
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    requiresSession: false
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    maxDeliveryCount: 10
    enableBatchedOperations: true
  }
}

resource emailDispatchQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'email-dispatch'
  properties: {
    lockDuration: 'PT30S'
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    requiresSession: false
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    maxDeliveryCount: 10
    enableBatchedOperations: true
  }
}

// Topics
resource eventStatusUpdatesTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'event-status-updates'
  properties: {
    defaultMessageTimeToLive: 'P14D'
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    enableBatchedOperations: true
  }
}

resource capacitySyncTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'capacity-sync'
  properties: {
    defaultMessageTimeToLive: 'P14D'
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    enableBatchedOperations: true
  }
}

resource orderUpdatesTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'order-updates'
  properties: {
    defaultMessageTimeToLive: 'P14D'
    maxSizeInMegabytes: 1024
    requiresDuplicateDetection: false
    enableBatchedOperations: true
  }
}

resource serviceBusRootAuth 'Microsoft.ServiceBus/namespaces/authorizationRules@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'RootManageSharedAccessKey'
  properties: {
    rights: [
      'Listen'
      'Send'
      'Manage'
    ]
  }
}

// Store Service Bus connection string in Key Vault
resource serviceBusConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'service-bus-connection-string'
  properties: {
    value: listKeys(serviceBusRootAuth.id, serviceBusRootAuth.apiVersion).primaryConnectionString
  }
}

// Store Redis password in Key Vault
resource redisPrimaryKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'redis-primary-key'
  properties: {
    value: cacheForRedis.listKeys().primaryKey
  }
}

// Store SQL connection string in Key Vault
resource sqlConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'sql-connection-string'
  properties: {
    value: format('sqlserver://{0}:1433;database={1};user={2};password={3};encrypt=true;trustServerCertificate=false;hostNameInCertificate=*.database.windows.net;loginTimeout=30;', sqlServer.properties.fullyQualifiedDomainName, sqlDatabaseName, sqlAdminUser, sqlAdminPassword)
  }
}

// Store Cosmos DB connection details in Key Vault
resource cosmosEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-endpoint'
  properties: {
    value: cosmosAccount.properties.documentEndpoint
  }
}

resource cosmosKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-key'
  properties: {
    value: cosmosAccount.listKeys().primaryMasterKey
  }
}

// ==================== Log Analytics Workspace ====================
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    retentionInDays: 30
    features: {
      searchVersion: 1
    }
  }
  sku: {
    name: 'PerGB2018'
  }
}

// ==================== Application Insights ====================
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ==================== Storage Account for Function App ====================
resource functionStorageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: functionStorageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// ==================== App Service Plan for Functions ====================
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  kind: 'functionapp'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: false
  }
}

// ==================== Function App ====================
var services = [
  'auth'
  'catalog'
  'inventory'
  'notification'
  'order'
  'payment'
  'read-model'
  'ticket'
]

resource functionApps 'Microsoft.Web/sites@2023-01-01' = [for service in services: {
  name: '${projectName}-${service}-api-${environment}'
  location: location
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      http20Enabled: true
      minTlsVersion: '1.2'
      detailedErrorLoggingEnabled: true
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${functionStorageAccount.name};AccountKey=${functionStorageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'BLOB_STORAGE_CONNECTION_STRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: 'InstrumentationKey=${appInsights.properties.InstrumentationKey}'
        }
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=sql-connection-string)'
        }
        {
          name: 'COSMOS_ENDPOINT'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=cosmos-endpoint)'
        }
        {
          name: 'COSMOS_KEY'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=cosmos-key)'
        }
        {
          name: 'SERVICE_BUS_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=service-bus-connection-string)'
        }
        {
          name: 'SB_QUEUE_ORDER_CREATED'
          value: orderCreatedQueue.name
        }
        {
          name: 'SB_QUEUE_PAYMENT_CONFIRMED'
          value: paymentConfirmedQueue.name
        }
        {
          name: 'SB_QUEUE_TICKET_ISSUED'
          value: ticketIssuedQueue.name
        }
        {
          name: 'SB_QUEUE_EMAIL_DISPATCH'
          value: emailDispatchQueue.name
        }
        {
          name: 'SB_TOPIC_EVENT_STATUS'
          value: eventStatusUpdatesTopic.name
        }
        {
          name: 'SB_TOPIC_CAPACITY_SYNC'
          value: capacitySyncTopic.name
        }
        {
          name: 'REDIS_HOST'
          value: cacheForRedis.properties.hostName
        }
        {
          name: 'REDIS_PORT'
          value: '6380'
        }
        {
          name: 'REDIS_PASSWORD'
          value: '@Microsoft.KeyVault(VaultName=${keyVault.name};SecretName=redis-primary-key)'
        }
        {
          name: 'REDIS_TLS_ENABLED'
          value: 'true'
        }
      ]
    }
  }
}]

// Enable function app diagnostics
resource functionAppDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = [for (service, i) in services: {
  name: '${projectName}-${service}-api-${environment}-diagnostics'
  scope: functionApps[i]
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      {
        category: 'FunctionAppLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}]

// ==================== CORS Configuration for Function App ====================
resource functionAppCors 'Microsoft.Web/sites/config@2023-01-01' = [for (service, i) in services: {
  parent: functionApps[i]
  name: 'web'
  properties: {
    cors: {
      allowedOrigins: concat(
        deployStaticWebApp ? ['https://*.azurestaticapps.net'] : [],
        [
          'http://localhost:3000'
        ]
      )
      supportCredentials: true
    }
  }
}]

// ==================== Function App Access to Key Vault ====================
resource functionAppKeyVaultAccess 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [for (service, i) in services: {
      tenantId: subscription().tenantId
      objectId: functionApps[i].identity.principalId
      permissions: {
        secrets: [
          'get'
          'list'
        ]
      }
    }]
  }
}

// ==================== Outputs ====================
output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output sqlServerId string = sqlServer.id
output sqlServerName string = sqlServer.name
output sqlDatabaseName string = sqlDatabaseName
output cosmosAccountId string = cosmosAccount.id
output cosmosAccountName string = cosmosAccount.name
output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output cacheForRedisId string = cacheForRedis.id
output cacheForRedisHostname string = cacheForRedis.properties.hostName
output serviceBusId string = serviceBusNamespace.id
output serviceBusNamespaceName string = serviceBusNamespace.name
output appInsightsId string = appInsights.id
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output functionAppNames array = [for (service, i) in services: functionApps[i].name]
output functionAppUrls array = [for (service, i) in services: 'https://${functionApps[i].properties.defaultHostName}/api']
output staticWebAppNameOutput string = deployStaticWebApp ? staticWebApp.name : ''
