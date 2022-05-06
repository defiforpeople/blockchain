VERSION=$$(npm view package.json version)

install:
	@echo "[install] Installing dependencies..."
	@npm install
	@cp .env.example .env

typescript: clean
	@echo "[typescript] Transpiling code..."
	@npm run typescript

clean:
	@echo "[clean] Cleaning dist folder..."
	@rm -rf dist/

linter:
	@echo "[linter] Running linter..."
	@npm run linter

check:
	@echo "[check] Checking project..."
	@make typescript
	@make test
	@make linter

run:
	@echo "[run] running service..."
	@npm start

dev:
	@echo "[run-dev] running service in debug mode..."
	@npm run dev

deploy:
	@echo "[deploy] Deploying version $(VERSION)"

destroy:
	@echo "[destroy] Destroying..."

test\:contracts:
	@echo "[test] Running contracts tests..."
	@NODE_ENV=test npm run test:contracts

test\:utils: 
	@echo "[test] Running utils tests..."
	@NODE_ENV=test npm run test:utils
	
tests:
	@echo "[test] Running all tests..."
	@make test:contracts
	@make test:utils

.PHONY: install typescript clean linter check run dev deploy destroy 