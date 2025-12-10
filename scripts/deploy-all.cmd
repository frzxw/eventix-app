@echo off
setlocal

echo Loading Azure variables...
call "%~dp0..\azure\scripts\00-az-variables.cmd"

echo Starting microservices deployment...
node "%~dp0deploy-microservices.js"

if errorlevel 1 (
    echo Deployment failed.
    exit /b 1
)

echo Deployment successful.
endlocal
