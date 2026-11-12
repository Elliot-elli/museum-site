#!/usr/bin/env bash
# build_cloud.sh — Cloudflare Pages 云端构建入口
#
# 用途：Cloudflare Pages 从 Git 克隆后，用它在云端生成 site/ 产物。
#   · site/ 被 .gitignore 排除（不入库），所以云端必须自己构建一次。
#   · 之所以不把 site/ 入库：它是产物，入库会导致「改 src 却忘记重新构建」
#     这类静默不一致；单一真源在 src/，产物随时可重建。
#
# 用法（Cloudflare Pages 构建命令填这个）：
#   bash tools/build_cloud.sh
#
# 环境要求：Linux/macOS 环境需 python3；Windows 本地可用 bash。
# 本脚本只依赖 bash + python3，无需 Node、无需 npm install。

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PY="python3"
command -v python3 >/dev/null 2>&1 || PY="python"
command -v "$PY" >/dev/null 2>&1 || { echo "[FAIL] 找不到 python3 / python"; exit 1; }

echo "==> 1/3 检查真源"
if [[ ! -d src ]]; then
  echo "[FAIL] src/ 不存在 —— 确认仓库根目录设置正确（根目录应留空）"
  exit 1
fi
echo "    src/ 存在，文件数：$(find src -type f | wc -l)"

echo "==> 2/3 构建产物"
"$PY" tools/build.py

echo "==> 3/3 校验产物"
if [[ ! -f site/index.html ]]; then
  echo "[FAIL] 构建后没有 site/index.html"
  exit 1
fi
COUNT=$(find site -type f | wc -l)
SIZE=$(du -sh site | cut -f1)
echo "    site/ 就绪：${COUNT} 个文件，${SIZE}"

echo "[OK] 云端构建完成"
