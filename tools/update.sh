#!/usr/bin/env bash
# update.sh —— 一键更新：构建 → 验证 → 提交推送
#
# 用法：
#   ./update.sh "更新案例 01 研究背景"    # 构建+验证+提交+推送
#   ./update.sh --build-only            # 只构建+验证，不提交
#   ./update.sh --no-verify              # 跳过验证（不建议）
#
# 前置：改完 src/ 下的文件后运行。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="C:/Users/EDY/.workbuddy/binaries/python/versions/3.13.12/python.exe"
export NODE_PATH="C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules"

MSG=""
BUILD_ONLY=0
DO_VERIFY=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-only) BUILD_ONLY=1; shift ;;
    --no-verify)  DO_VERIFY=0; shift ;;
    *)            MSG="$1"; shift ;;
  esac
done

echo "==> 1/4 构建"
"$PY" tools/build.py

if [[ $DO_VERIFY -eq 1 ]]; then
  echo
  echo "==> 2/4 功能验证"
  node tools/verify.js
  echo
  echo "==> 3/4 多视口验证"
  node tools/verify_viewports.js
else
  echo
  echo "==> 2/4 功能验证（已跳过）"
  echo "==> 3/4 多视口验证（已跳过）"
fi

if [[ $BUILD_ONLY -eq 1 ]]; then
  echo
  echo "[OK] 构建与验证完成（未提交）。"
  exit 0
fi

if [[ -z "$MSG" ]]; then
  MSG="chore: 更新站点内容 $(date '+%Y-%m-%d %H:%M')"
fi

echo
echo "==> 4/4 提交并推送"
git add -A
git commit -m "$MSG"
git push

echo
echo "[OK] 已推送，Cloudflare Pages 将在 30–60 秒内自动部署。"
echo "     线上链接不变。"
