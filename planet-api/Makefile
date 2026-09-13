GOPROXY ?= https://goproxy.cn,direct
export GOPROXY

DATABASE_URL ?= postgres:///planet
# 管理连接：用于建库与测试数据库生命周期（本地 peer 认证；CI 里覆盖为服务连接串）
ADMIN_DATABASE_URL ?= postgres:///postgres
TEST_DATABASE_URL ?= postgres:///postgres

.PHONY: tidy build vet test run db-ensure migrate-up migrate-down migrate-status seed demo

tidy:
	go mod tidy

build:
	go build -o bin/planet-api ./cmd/planet-api
	go build -o bin/planet-cli ./cmd/planet-cli

vet:
	go vet ./...

test:
	go test ./...

test-integration:
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) go test ./test/integration/... -v -count=1

run:
	go run ./cmd/planet-api

db-ensure:
	go run ./cmd/planet-cli db-ensure --admin-url "$(ADMIN_DATABASE_URL)" --db planet

migrate-up:
	go run ./cmd/planet-cli migrate up --url "$(DATABASE_URL)"

migrate-down:
	go run ./cmd/planet-cli migrate down 1 --url "$(DATABASE_URL)" --allow-destructive

migrate-status:
	go run ./cmd/planet-cli migrate status --url "$(DATABASE_URL)"

demo:
	go run ./cmd/planet-cli demo-seed --url "$(DATABASE_URL)"
