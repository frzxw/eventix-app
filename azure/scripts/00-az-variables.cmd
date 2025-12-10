@echo off
REM Eventix Azure variables - EDIT THESE before running other scripts

REM Subscription, region, and environment suffix
set AZ_SUBSCRIPTION_ID=933ce288-5f63-4a7c-90fe-22dc4af6bff6
set AZ_LOCATION=malaysiawest
set AZ_ENVIRONMENT=prod
set AZ_PROJECT_NAME=eventix-mw2

REM Core resource names
set AZ_RG=eventix-rg
set AZ_DEPLOYER_OBJECT_ID=
set AZ_KEYVAULT=%AZ_PROJECT_NAME%-kv-%AZ_ENVIRONMENT%
set AZ_APPINSIGHTS=%AZ_PROJECT_NAME%-insights-%AZ_ENVIRONMENT%
set AZ_FUNCTIONAPP=%AZ_PROJECT_NAME%-api-%AZ_ENVIRONMENT%
set AZ_REDIS=%AZ_PROJECT_NAME%-cache-%AZ_ENVIRONMENT%
set AZ_SERVICEBUS=%AZ_PROJECT_NAME%-sb-%AZ_ENVIRONMENT%
set AZ_SQL_SERVER=%AZ_PROJECT_NAME%-sql-%AZ_ENVIRONMENT%
set AZ_SQL_DB=eventix-db
set AZ_COSMOS_ACCOUNT=%AZ_PROJECT_NAME%-cosmos-%AZ_ENVIRONMENT%
set AZ_STATIC_WEB_APP=%AZ_PROJECT_NAME%-app-%AZ_ENVIRONMENT%
set AZ_DEPLOY_STATIC_WEB_APP=true
set AZ_STATIC_WEB_APP_LOCATION=eastasia
set AZ_STATIC_WEB_APP_SKU_NAME=Standard
set AZ_STATIC_WEB_APP_SKU_TIER=Standard

REM SQL Server credentials (set secure values in local override)
set AZ_SQL_ADMIN_USER=eventix_admin
set AZ_SQL_ADMIN_PASSWORD=

REM Frontend build env (update after Function App deploy)
set VITE_API_URL=
set VITE_APPINSIGHTS_CONNECTION_STRING=

REM Optional: load developer-local overrides (ignored by git)
if exist "%~dp0\00-az-variables.local.cmd" (
	call "%~dp0\00-az-variables.local.cmd"
)

echo Variables loaded. Use 00-az-variables.local.cmd for secrets; it is git-ignored.
exit /b 0
