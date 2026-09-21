# tanalyse 构建管理
# 常用入口:
#   make dev      开发运行(热重载)
#   make release  发布构建(macOS 本地产出 .app/.dmg)
#   make test     全部测试(前端 + Rust)
#   make check    全部静态检查(typecheck + fmt + clippy)
#   make fuzz     Rust 模糊测试(需要 nightly 工具链与 cargo-fuzz)
#   make help     查看全部目标

.DEFAULT_GOAL := help
SHELL := /bin/bash

SRC_DIR := src-tauri
FUZZ_SECONDS := 60

.PHONY: help init dev debug release check fmt fmt-check test coverage fuzz clean icon

help: ## 显示本帮助
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

init: ## 安装前端依赖
	npm install

dev: ## 开发运行(Tauri + Vite 热重载)
	npm run tauri dev

debug: ## Rust 调试构建(src-tauri/target/debug)
	cargo build --manifest-path $(SRC_DIR)/Cargo.toml

release: ## 发布构建(先跑 check 与 test,再打包)
	$(MAKE) check
	$(MAKE) test
	npm run tauri build

app: ## 仅构建 .app/可执行(跳过 dmg 等系统封装,适合本地快速验证)
	$(MAKE) check
	$(MAKE) test
	npm run tauri build -- --no-bundle
	npm run tauri build -- --bundles app

check: ## 静态检查:TypeScript + rustfmt + clippy + cargo check
	npm run typecheck
	cargo fmt --manifest-path $(SRC_DIR)/Cargo.toml --all --check
	cargo clippy --manifest-path $(SRC_DIR)/Cargo.toml --all-targets -- -D warnings

fmt: ## 格式化 Rust 代码
	cargo fmt --manifest-path $(SRC_DIR)/Cargo.toml --all

test: ## 运行全部测试(前端 Vitest/属性模糊 + Rust 单元测试)
	npm test
	cargo test --manifest-path $(SRC_DIR)/Cargo.toml

coverage: ## 覆盖率报告,门槛 90%(前端 HTML 在 coverage/,Rust 排除启动胶水)
	npm run coverage
	cargo llvm-cov --manifest-path $(SRC_DIR)/Cargo.toml --summary-only \
		--ignore-filename-regex 'src/(main|lib)\.rs$$' --fail-under-lines 90

fuzz: ## Rust 模糊测试 $(FUZZ_SECONDS) 秒(依赖 nightly + cargo-fuzz)
	cargo +nightly fuzz run parse_data --fuzz-dir fuzz -- -max_total_time=$(FUZZ_SECONDS)

icon: ## 重新生成图标(浅绿渐变 + 提交格子母题)
	python3 scripts/gen_icon.py $(SRC_DIR)/icons/icon-source.png
	npx tauri icon $(SRC_DIR)/icons/icon-source.png

clean: ## 清理构建产物(保留 node_modules)
	rm -rf dist coverage $(SRC_DIR)/target
