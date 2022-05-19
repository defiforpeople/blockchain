# FRP BINARY BY SO
FRP_BIN=
UNAME_S=$(shell uname -s)
ifeq ($(UNAME_S),Linux)
	FRP_BIN=frpc-amd64
endif
ifeq ($(UNAME_S),Darwin)
	FRP_BIN=frpc-darwin
endif

VERSION=$$(npm view package.json version)
FRP_PID=$$(ps | grep './assets/$(FRP_BIN) -c ./frpc.ini' | grep -v '/bin/sh' | grep -v 'grep' | head -n 1 | awk '{print $$1}')

prepare:
	@echo "[prepare] Preparing repository..."
	@cp .env.example .env
	@cp frpc.ini.example frpc.ini

install: prepare
	@echo "[install] Installing dependencies..."
	@npm install

typescript: clean
	@echo "[typescript] Transpiling code..."
	@npm run typescript

clean:
	@echo "[clean] Cleaning..."
	@rm -rf dist
	@rm -rf src/artifacts
	@rm -rf src/cache
	@rm -rf src/typechain

compile: clean
	@echo "[compile] Compiling the contracts..."
	@TS_NODE_TRANSPILE_ONLY=true npx hardhat typechain

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

node:
	@echo "[node] running reverse proxy for moralis connection..."
	@./assets/$(FRP_BIN) -c ./frpc.ini &
	@echo "[node] running hardhat node..."
	@npx hardhat node

console:
	@echo "[console] running hardhat node..."
	@npx hardhat console --network localhost

dev:
	@echo "[dev] running service in debug mode..."
	@npm run dev 

stop:
	@if [ "$(FRP_PID)" = "" ]; then\
		echo "[stop] no frp service to stop";\
  fi
	@if [ "$(FRP_PID)" != "" ]; then\
		echo "[stop] stopping reverse proxy, run command again";\
    kill -9 $(FRP_PID);\
  fi

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