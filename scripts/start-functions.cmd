@echo off
cd /d "%~dp0\.."
echo Starting all Azure Functions...

start "Auth Service" cmd /k "cd azure/services/auth-service && func start --port 7071"
start "Catalog Service" cmd /k "cd azure/services/catalog-service && func start --port 7072"
start "Inventory Service" cmd /k "cd azure/services/inventory-service && func start --port 7073"
start "Order Service" cmd /k "cd azure/services/order-service && func start --port 7074"
start "Payment Service" cmd /k "cd azure/services/payment-service && func start --port 7075"
start "Ticket Service" cmd /k "cd azure/services/ticket-service && func start --port 7076"
start "Notification Service" cmd /k "cd azure/services/notification-service && func start --port 7077"
start "Read Model Service" cmd /k "cd azure/services/read-model-service && func start --port 7078"

echo All services started in separate windows.
