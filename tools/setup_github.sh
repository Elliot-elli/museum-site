#!/usr/bin/env bash
# setup_github.sh — 一键完成 GitHub 建仓与推送
#
# 前置：已按 docs/GO-LIVE-CHECKLIST.md 步骤 1 把公钥贴到 GitHub
#       （本脚本会先检测，没贴会提示）
#
# 用法：
#   bash tools/setup_github.sh              # 检查 + 推送
#   bash tools/setup_github.sh --check      # 只检查不推送
#
# 幂等：可重复运行；远程已有提交时会跳过建仓相关的报错。

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPO="museum-site"
USER_NAME="Elliot-elli"
SSH_KEY="C:/Users/EDY/.ssh/id_ed25519_github"
REMOTE="git@github.com:${USER_NAME}/${REPO}.git"

CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

echo "══════════════════════════════════════════"
echo " GitHub 仓库配置检查"
echo "══════════════════════════════════════════"
echo

# ── 1. SSH 密钥 ──
if [[ -f "$SSH_KEY" ]]; then
  echo "  [OK ] SSH 私钥存在"
  echo "         公钥: $(cat ${SSH_KEY}.pub)"
else
  echo "  [FAIL] 找不到 SSH 私钥：$SSH_KEY"
  exit 1
fi

# ── 2. SSH 认证 ──
echo
echo "  → 测试 GitHub SSH 认证…"
AUTH_OUT=$(ssh -o BatchMode=yes -o ConnectTimeout=15 -T git@github.com 2>&1)
if echo "$AUTH_OUT" | grep -q "successfully authenticated"; then
  echo "  [OK ] SSH 认证通过"
  echo "         $AUTH_OUT" | head -1
  SSH_OK=1
else
  echo "  [FAIL] SSH 认证未通过"
  echo "         $AUTH_OUT" | head -2
  echo
  echo "         ▸ 请先完成步骤 1："
  echo "           1) 打开 https://github.com/settings/ssh/new"
  echo "           2) 把下面的公钥整行粘贴进去并保存："
  echo "             $(cat ${SSH_KEY}.pub)"
  SSH_OK=0
fi

# ── 3. git 配置 ──
echo
echo "  → 检查 git 配置…"
SSH_CMD=$(git config --global --get core.sshCommand 2>/dev/null || true)
if [[ -n "$SSH_CMD" ]]; then
  echo "  [OK ] core.sshCommand 已配置（SSH 443 绕过被拦截的 HTTPS）"
else
  echo "  [WARN] core.sshCommand 未配置 → git 会走 HTTPS，而本机 github.com:443 被代理拦截"
  echo "         建议执行："
  echo "         git config --global core.sshCommand 'ssh -o HostName=ssh.github.com -p 443 -i C:/Users/EDY/.ssh/id_ed25519_github -o IdentitiesOnly=yes'"
fi

if [[ -z "$(git config --global --get user.name || true)" ]]; then
  git config --global user.name "飞象老师"
  git config --global user.email "teacher@feixiang.com"
  echo "  [OK ] 已设置 git user.name / user.email"
else
  echo "  [OK ] git 身份: $(git config --global --get user.name) <$(git config --global --get user.email)>"
fi

# ── 4. 仓库状态 ──
echo
echo "  → 检查本地仓库…"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMITS=$(git rev-list --count HEAD)
echo "  [OK ] 分支 $BRANCH，$COMMITS 个提交"
if git check-ignore -q site/index.html; then
  echo "  [OK ] site/ 已正确排除（构建产物不入库）"
else
  echo "  [WARN] site/ 未被忽略 —— 检查 .gitignore"
fi

# ── 5. remote ──
CURRENT=$(git remote get-url origin 2>/dev/null || true)
if [[ "$CURRENT" != "$REMOTE" ]]; then
  git remote remove origin 2>/dev/null || true
  git remote add origin "$REMOTE"
  echo "  [OK ] remote 已设为 $REMOTE"
else
  echo "  [OK ] remote: $REMOTE"
fi

if [[ $CHECK_ONLY -eq 1 ]]; then
  echo
  echo "[检查模式] 未执行推送。"
  exit 0
fi

# ── 6. 推送 ──
if [[ $SSH_OK -eq 0 ]]; then
  echo
  echo "[STOP] SSH 未认证，无法推送。请先完成上面的步骤 1。"
  exit 1
fi

echo
echo "══════════════════════════════════════════"
echo " 推送到 GitHub"
echo "══════════════════════════════════════════"
echo
git push -u origin "$BRANCH" 2>&1 | tail -8

echo
echo "  → 验证远程分支…"
if git ls-remote --heads origin "$BRANCH" | grep -q .; then
  echo "  [OK ] 远程分支已存在：$BRANCH"
  echo
  echo "  下一步：连接 Cloudflare Pages"
  echo "    https://dash.cloudflare.com → Workers 和 Pages → 创建 → Pages → 连接到 Git"
  echo "    选 Elliot-elli/museum-site，构建输出目录填 site，构建命令留空"
  echo
  echo "  详细步骤见 docs/GO-LIVE-CHECKLIST.md 步骤 4"
else
  echo "  [FAIL] 推送后未看到远程分支，请检查上方错误"
  exit 1
fi
