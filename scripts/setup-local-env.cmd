@echo off
echo Starting Docker containers...
docker-compose up -d

echo Waiting for SQL Server to be ready...
timeout /t 30 /nobreak

echo Generating seed data...
python scripts/generate-seed.py

echo Running Schema Migration...
type azure\database\schema.sql | docker exec -i eventix-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P StrongPassword123! -d master -C

echo Seeding Database...
type azure\database\seed.sql | docker exec -i eventix-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P StrongPassword123! -d eventix -C

echo Setup Complete!
