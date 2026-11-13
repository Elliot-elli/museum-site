#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
bind_domain.py — 用 Cloudflare API 完成「自有域名绑定」的全流程。

设计原则：
  1. **默认只读**（status），任何会改到云端的动作都必须显式加 --apply。
     这是对外部系统的写操作，不能手滑。
  2. **只用标准库**（urllib / json / hmac / hashlib），不装任何包。
  3. **幂等**：每一步先查后写，重复跑不会重复建资源。
  4. **不打印密钥**。

覆盖「路线 A（NS 托管 Cloudflare）」的完整链路：
  zone      在 CF 建区域，返回要填到注册商的两个 NS
  pages     把域名加为 Pages 项目的自定义域名
  cname     在 zone 里建 proxied CNAME → <project>.pages.dev
  redirect  建 www → apex 的 301 Redirect Rule
  status    查看当前状态（只读）
  verify    调用 tools/verify_domain.js 跑 7 项验收

用法示例：
  export CF_API_TOKEN=xxxx
  export CF_ACCOUNT_ID=xxxxxxxx
  python tools/bind_domain.py status  --domain example.com
  python tools/bind_domain.py zone    --domain example.com --apply
  python tools/bind_domain.py bind    --domain example.com --apply
  python tools/bind_domain.py verify  --domain example.com

API 依据（2026-11-13 核对官方文档）：
  POST /zones                                                        权限 Zone Edit
  POST /zones/{zone_id}/dns_records                                  权限 DNS Write
  POST /accounts/{account_id}/pages/projects/{project}/domains       权限 Pages Edit
      body 必须用 {"name": ...}（用 {"domain": ...} 会被 API 拒绝）
  POST /zones/{zone_id}/rulesets  phase=http_request_dynamic_redirect
      权限 Dynamic URL Redirects Write
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"
DEFAULT_PROJECT = "museum-site-cwb"
DEFAULT_PAGES_HOST = "museum-site-cwb.pages.dev"

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


# ── HTTP ─────────────────────────────────────────────────────────
def cf(method: str, path: str, body: dict | None = None) -> tuple[bool, dict]:
    token = os.environ.get("CF_API_TOKEN", "").strip()
    if not token:
        print(f"{RED}[FAIL]{RESET} 未设置环境变量 CF_API_TOKEN")
        print("     Cloudflare 后台 → My Profile → API Tokens → Create Token")
        print("     权限勾选：Zone Edit / Zone DNS Edit / Pages Edit / Dynamic URL Redirects Write")
        sys.exit(2)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path, data=data, method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"success": False, "errors": [{"message": raw[:400]}]}
        payload["_http_status"] = e.code
        return False, payload
    except Exception as e:  # noqa: BLE001
        return False, {"success": False, "errors": [{"message": str(e)}]}
    return bool(payload.get("success")), payload


def err_text(payload: dict) -> str:
    errs = payload.get("errors") or []
    if not errs:
        return payload.get("_http_status", "?")
    return "; ".join(f"{e.get('code')}:{e.get('message')}" for e in errs)[:400]


def need_account_id() -> str:
    acct = os.environ.get("CF_ACCOUNT_ID", "").strip()
    if acct:
        return acct
    ok, payload = cf("GET", "/accounts")
    if ok and payload.get("result"):
        return payload["result"][0]["id"]
    print(f"{RED}[FAIL]{RESET} 拿不到 CF_ACCOUNT_ID，请手动设置环境变量")
    print(f"     Cloudflare 后台右侧栏可见 Account ID。错误：{err_text(payload)}")
    sys.exit(2)


def get_zone(domain: str) -> dict | None:
    ok, payload = cf("GET", f"/zones?name={domain}")
    if ok and payload.get("result"):
        return payload["result"][0]
    return None


# ── 动作：zone ───────────────────────────────────────────────────
def cmd_zone(args) -> int:
    domain = args.domain
    z = get_zone(domain)
    if z:
        print(f"[OK] 区域已存在：{z['name']}  zone_id={z['id']}  状态={z['status']}")
        print(f"     NS: {', '.join(z['name_servers'])}")
        return 0
    if not args.apply:
        print(f"{YELLOW}[DRY-RUN]{RESET} 将在 CF 创建区域 {domain}")
        print(f"     创建后请到【域名注册商】把 NS 改成下面两个，然后等解析生效。")
        return 0
    ok, payload = cf("POST", "/zones", {
        "name": domain,
        "account": {"id": need_account_id()},
        "type": "full",
    })
    if not ok:
        print(f"{RED}[FAIL]{RESET} 创建区域失败：{err_text(payload)}")
        return 1
    z = payload["result"]
    print(f"{GREEN}[OK]{RESET} 已创建区域 {z['name']}  zone_id={z['id']}")
    print(f"\n  🔴 下一步：到【域名注册商】把 NS 改成这两个（这一步只能在注册商后台做）")
    for ns in z["name_servers"]:
        print(f"       {ns}")
    print(f"\n  改完后等解析生效（10 分钟 ~ 24 小时），再跑：")
    print(f"       python tools/bind_domain.py bind --domain {domain} --apply")
    return 0


# ── 动作：pages（加自定义域名） ──────────────────────────────────
def cmd_pages(args) -> int:
    domain = args.domain
    project = args.project
    acct = need_account_id()

    ok, payload = cf("GET", f"/accounts/{acct}/pages/projects/{project}/domains")
    if ok:
        for d in payload.get("result") or []:
            if d["name"] == domain:
                print(f"[OK] 自定义域名已存在：{domain}  状态={d['status']}")
                return 0
    if not args.apply:
        print(f"{YELLOW}[DRY-RUN]{RESET} 将把 {domain} 加为 Pages 项目 {project} 的自定义域名")
        return 0

    ok, payload = cf("POST", f"/accounts/{acct}/pages/projects/{project}/domains", {"name": domain})
    if not ok:
        print(f"{RED}[FAIL]{RESET} 添加自定义域名失败：{err_text(payload)}")
        print("     注意：body 必须用 {\"name\": ...}，用 {\"domain\": ...} 会被 API 拒绝")
        return 1
    d = payload["result"]
    print(f"{GREEN}[OK]{RESET} 已添加自定义域名 {d['name']}  状态={d['status']}")
    if d.get("validation_data"):
        v = d["validation_data"]
        print(f"     验证方式={v.get('method')}  状态={v.get('status')}")
        if v.get("txt_name"):
            print(f"     需要加 TXT 记录：{v['txt_name']} = {v.get('txt_value')}")
    return 0


# ── 动作：cname（zone 内的 proxied CNAME） ───────────────────────
def cmd_cname(args) -> int:
    domain = args.domain
    host = args.host
    target = args.pages_host
    z = get_zone(domain)
    if not z:
        print(f"{RED}[FAIL]{RESET} CF 里还没有 {domain} 的区域，先跑：bind_domain.py zone --domain {domain} --apply")
        return 1
    fqdn = domain if host in ("@", "", domain) else f"{host}.{domain}"

    ok, payload = cf("GET", f"/zones/{z['id']}/dns_records?name={fqdn}")
    existing = (payload.get("result") or []) if ok else []
    for r in existing:
        if r.get("type") == "CNAME" and r.get("content", "").rstrip(".") == target.rstrip("."):
            print(f"[OK] CNAME 已存在且正确：{fqdn} → {target} (proxied={r.get('proxied')})")
            return 0

    if not args.apply:
        print(f"{YELLOW}[DRY-RUN]{RESET} 将建 CNAME：{fqdn} → {target}  (proxied=true)")
        return 0

    ok, payload = cf("POST", f"/zones/{z['id']}/dns_records", {
        "type": "CNAME",
        "name": fqdn,
        "content": target,
        "ttl": 1,
        "proxied": True,          # 🔴 必须 true：区域级规则（Redirect Rules）只在已代理记录上生效
        "comment": "Cloudflare Pages custom domain",
    })
    if not ok:
        print(f"{RED}[FAIL]{RESET} 建 CNAME 失败：{err_text(payload)}")
        return 1
    r = payload["result"]
    print(f"{GREEN}[OK]{RESET} 已建 CNAME {r['name']} → {r['content']}  proxied={r.get('proxied')}")
    return 0


# ── 动作：redirect（www → apex 301） ─────────────────────────────
def cmd_redirect(args) -> int:
    domain = args.domain
    www = f"www.{domain}"
    z = get_zone(domain)
    if not z:
        print(f"{RED}[FAIL]{RESET} CF 里还没有 {domain} 的区域")
        return 1

    phase = "http_request_dynamic_redirect"
    entry = f"/zones/{z['id']}/rulesets/phases/{phase}/entrypoint"

    ok, payload = cf("GET", entry)
    exists = ok and bool(payload.get("result"))
    ruleset_id = payload["result"]["id"] if exists else None
    current_rules = (payload["result"].get("rules") or []) if exists else []

    rule = {
        "ref": f"www_to_apex_{domain.replace('.', '_')}",
        "description": f"www → apex 301 ({www} → {domain})",
        "expression": f'(http.host eq "{www}")',
        "action": "redirect",
        "action_parameters": {
            "from_value": {
                "target_url": {"expression": f'concat("https://{domain}", http.request.uri.path)'},
                "status_code": 301,
                "preserve_query_string": True,
            }
        },
    }
    if any(r.get("ref") == rule["ref"] for r in current_rules):
        print(f"[OK] Redirect Rule 已存在：{www} → https://{domain} (301)")
        return 0

    if not args.apply:
        print(f"{YELLOW}[DRY-RUN]{RESET} 将建 Redirect Rule：{www} → https://{domain} (301, 保留路径与查询串)")
        return 0

    new_rules = [r for r in current_rules if r.get("ref") != rule["ref"]] + [rule]
    body = {
        "name": "Redirect rules ruleset",
        "kind": "zone",
        "phase": phase,
        "rules": new_rules,
    }
    if exists:
        ok, payload = cf("PUT", f"/zones/{z['id']}/rulesets/{ruleset_id}", body)
        verb = "更新"
    else:
        ok, payload = cf("POST", f"/zones/{z['id']}/rulesets", body)
        verb = "创建"
    if not ok:
        print(f"{RED}[FAIL]{RESET} {verb} Redirect Rule 失败：{err_text(payload)}")
        print("     权限需要：Dynamic URL Redirects Write")
        return 1
    print(f"{GREEN}[OK]{RESET} 已{verb} Redirect Rule：{www} → https://{domain} (301)")
    return 0


# ── 动作：bind（串起全流程） ─────────────────────────────────────
def cmd_bind(args) -> int:
    steps = [
        ("pages", cmd_pages),
        ("cname", cmd_cname),
        ("redirect", cmd_redirect),
    ]
    for name, fn in steps:
        print(f"\n=== 步骤：{name} ===")
        rc = fn(args)
        if rc != 0:
            print(f"{RED}[FAIL]{RESET} 步骤 {name} 失败，停止。")
            return rc
    print(f"\n{GREEN}[OK]{RESET} 配置动作全部完成。")
    print(f"  接下来等证书签发（1~2 分钟，状态变 Active），然后跑验收：")
    print(f"    python tools/bind_domain.py verify --domain {args.domain}")
    return 0


# ── 动作：status（只读） ─────────────────────────────────────────
def cmd_status(args) -> int:
    domain = args.domain
    acct = need_account_id()
    project = args.project

    print(f"=== Cloudflare 区域 ===")
    z = get_zone(domain)
    if z:
        print(f"  区域 {z['name']}  id={z['id']}  状态={z['status']}")
        print(f"  NS: {', '.join(z['name_servers'])}")
        ok, payload = cf("GET", f"/zones/{z['id']}/dns_records")
        if ok:
            print(f"  DNS 记录：")
            for r in payload.get("result") or []:
                print(f"    {r['type']:6} {r['name']:40} → {r['content']}  proxied={r.get('proxied')}")
    else:
        print(f"  {YELLOW}区域不存在{RESET}（还没把 NS 托管到 CF）")

    print(f"\n=== Pages 自定义域名（项目 {project}）===")
    ok, payload = cf("GET", f"/accounts/{acct}/pages/projects/{project}/domains")
    if ok:
        rows = payload.get("result") or []
        if not rows:
            print(f"  {YELLOW}还没有任何自定义域名{RESET}")
        for d in rows:
            print(f"  {d['name']:40} 状态={d['status']}")
    else:
        print(f"  {RED}读取失败{RESET}：{err_text(payload)}")

    print(f"\n=== Redirect Rules ===")
    if z:
        ok, payload = cf("GET", f"/zones/{z['id']}/rulesets/phases/http_request_dynamic_redirect/entrypoint")
        if ok and payload.get("result"):
            for r in payload["result"].get("rules") or []:
                print(f"  ref={r.get('ref')}  expr={r.get('expression')}")
        else:
            print(f"  {YELLOW}还没有 Dynamic Redirect 规则集{RESET}")
    return 0


# ── 动作：verify（跑 7 项验收） ─────────────────────────────────
def cmd_verify(args) -> int:
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__))
    script = os.path.join(here, "verify_domain.js")
    cmd = ["node", script, args.domain]
    if args.no_www:
        cmd.append("--no-www")
    print(f"$ node tools/verify_domain.js {args.domain}{' --no-www' if args.no_www else ''}\n")
    env = dict(os.environ)
    env.setdefault("NODE_PATH", "C:/Users/EDY/.workbuddy/binaries/node/workspace/node_modules")
    return subprocess.call(cmd, env=env)


def main() -> int:
    ap = argparse.ArgumentParser(description="Cloudflare Pages 自有域名绑定工具")
    ap.add_argument("action",
                    choices=["status", "zone", "pages", "cname", "redirect", "bind", "verify"])
    ap.add_argument("--domain", required=True, help="自有域名，如 example.com")
    ap.add_argument("--host", default="@", help="要绑的主机名；@ = 根域名，museum = museum.example.com")
    ap.add_argument("--project", default=DEFAULT_PROJECT, help=f"Pages 项目名（默认 {DEFAULT_PROJECT}）")
    ap.add_argument("--pages-host", default=DEFAULT_PAGES_HOST, help=f"Pages 默认域名（默认 {DEFAULT_PAGES_HOST}）")
    ap.add_argument("--no-www", action="store_true", help="验收时跳过 www 跳转检查")
    ap.add_argument("--apply", action="store_true", help="真正执行写操作（不加则只做演练/只读）")
    args = ap.parse_args()

    handlers = {
        "status": cmd_status, "zone": cmd_zone, "pages": cmd_pages,
        "cname": cmd_cname, "redirect": cmd_redirect, "bind": cmd_bind, "verify": cmd_verify,
    }
    print(f"{DIM}{API} · 项目 {args.project} · 域名 {args.domain}{RESET}")
    return handlers[args.action](args)


if __name__ == "__main__":
    sys.exit(main())
