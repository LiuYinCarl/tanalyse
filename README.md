# tanalyse · 极简时间块记录

一个用 **Tauri 2** 构建的跨平台时间记录小工具:像填格子一样记录一天,像 GitHub 提交图一样回顾,用饼图和折线图分析时间去哪了。界面采用液态玻璃风格(半透明 + 环境光 + 高斯模糊),浅绿色为默认主题色,与图标一致。

![技术栈](https://img.shields.io/badge/Tauri-2-24C8DB) ![测试](https://img.shields.io/badge/coverage-%E2%89%A590%25-brightgreen)

## 特性

- **30 分钟格子**:一天 48 格,选中顶部分类(工作/休息/自定义)后单击填格;**双击格子**弹窗把 30 分钟切成 3 个 10 分钟小格,支持更细的时间划分;右键清除。
- **GitHub 提交图**:近 26 周热力图,点击任意一天跳转查看。
- **统计**:各分类时间占比(环形饼图)+ 随时间各分类花费(折线图),支持近 7/30/90 天与全部。
- **分类自定义**:内置工作/休息,可新增自定义分类;颜色默认提供一批**莫兰迪色**。
- **液态玻璃外观**:浅色/深色/跟随系统;环境光渐变 + 高斯模糊 + 高光描边;macOS 叠加原生 vibrancy,Windows 使用 Acrylic。
- **数据即 JSON**:语义版本号的 schema,便于分享与迁移;自动修复损坏字段,来自更高主版本的数据只读保护。
- **可移植**:数据文件 `tanalyse-data.json` 与程序同目录,单程序免安装;目录只读时自动回退到用户配置目录。
- **三个 Tab**:格子、统计、设置(开机自启、主题、主题色、导入导出)。

## 体积与安装

Release 构建的单体可执行程序约 5–10 MB(实测 3.3 MB,远小于 20 MB 目标):

| 平台 | 产物 |
| --- | --- |
| macOS | `tanalyse.app` / `.dmg`(Apple Silicon 与 Intel) |
| Windows | `tanalyse.exe`(便携版 zip)+ NSIS 安装器 |
| Linux | AppImage / deb |

Windows/Linux 便携版把 `tanalyse.exe`(或 AppImage)放任意目录即可运行,数据文件自动生成在同目录。

## 开发

```bash
make init        # 安装前端依赖
make dev         # 开发运行(热重载)
make release     # 发布构建(先跑 check 与 test)
```

## Makefile 目标

| 目标 | 说明 |
| --- | --- |
| `make dev` | 开发运行(Tauri + Vite 热重载) |
| `make release` | 发布构建(自动先跑 `check` 与 `test`) |
| `make debug` | Rust 调试构建 |
| `make check` | TypeScript 检查 + rustfmt 检查 + clippy(`-D warnings`) |
| `make fmt` | 格式化 Rust 代码 |
| `make test` | 前端测试 + Rust 测试 |
| `make coverage` | 双端覆盖率报告,门槛 90% |
| `make fuzz` | Rust 模糊测试 60 秒(需 nightly + cargo-fuzz) |
| `make icon` | 重新生成应用图标 |
| `make clean` | 清理构建产物 |

## 测试与质量

- **单元测试**:Vitest(逻辑层:semver/迁移/格子模型/统计/颜色/状态)+ Rust(`cargo test`,命令层用 tauri mock runtime 直调)。
- **模糊测试**:fast-check 属性测试(随机操作序列下的模型不变量、往返无损、垃圾输入不崩溃)纳入 `make test`;cargo-fuzz 针对 Rust JSON 校验函数(`make fuzz`)。
- **覆盖率门槛 90%**:前端实测 ≈97.5%(`coverage/` 报告);Rust 实测 ≈94.8%(排除 `main.rs`/`lib.rs` 启动胶水,`cargo llvm-cov`)。

## CI/CD

- **ci.yml**:推送 main / PR 触发 — 前端测试 + 覆盖率门槛、Rust fmt/clippy/test + 覆盖率门槛、cargo-fuzz 短时模糊测试。
- **release.yml**:推送 `v*` tag 触发 — 矩阵构建 macOS(Apple Silicon/Intel)、Windows、Linux,自动创建 GitHub Release 并上传安装包与便携版。

发版流程:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 数据格式

```json
{
  "version": "1.0.0",
  "appVersion": "1.0.0",
  "categories": [
    { "id": "work", "name": "工作", "color": "#9caf9f", "builtin": "work" }
  ],
  "entries": {
    "2026-09-21": [null, "work", "work", "... 共 144 个位置,每 10 分钟一个"]
  },
  "settings": { "theme": "system", "accentColor": "#8fcba8", "weekStartsOn": 1, "autoStart": false }
}
```

- `version` 为数据 schema 的语义版本号;升级程序时自动迁移,保存时盖章当前版本。
- 一天 = 144 个 10 分钟位置;30 分钟格子 = 3 个连续位置。

## License

MIT
