VERSION=$$(npm view package.json version)
FRP_FOLDER=frp-0.42.0
FRP_PID=$$(ps | grep $(FRP_FOLDER) | awk '{print $$1}' | tail -n 1)

install:
	@echo "[install] Installing dependencies..."
	@npm install
	@cp .env.example .env
	@cp .frpc.ini.example .frpc.ini

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
	@echo "[run-dev] running reverse proxy for moralis connection..."
	@./assets/frp-0.42.0/frpc -c ./assets/frp-0.42.0/frpc.ini &
	@echo "[run-dev] running hardhat node..."
	@npx hardhat node &
	@echo "[run-dev] running service in debug mode..."
	@npm run dev

stop:
	@echo "[run-dev] stoping reverse proxy"
	@kill -9 $(FRP_PID)

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