@echo off
echo Starting all Azure Functions...

start "Auth Service" cmd /c "cd azure/services/auth-service && func start --port 7071"
start "Catalog Service" cmd /c "cd azure/services/catalog-service && func start --port 7072"
start "Inventory Service" cmd /c "cd azure/services/inventory-service && func start --port 7073"
start "Order Service" cmd /c "cd azure/services/order-service && func start --port 7074"
start "Payment Service" cmd /c "cd azure/services/payment-service && func start --port 7075"
start "Ticket Service" cmd /c "cd azure/services/ticket-service && func start --port 7076"
start "Notification Service" cmd /c "cd azure/services/notification-service && func start --port 7077"
start "Read Model Service" cmd /c "cd azure/services/read-model-service && func start --port 7078"

echo All services started in separate windows.
