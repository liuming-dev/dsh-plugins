#!/usr/bin/env python3
"""Read-only browser acceptance for the installed CLIProxyAPI Plus panel.

Requires DSH_WEB_URL to contain a current authenticated Harness URL. The test never
starts the proxy, launches authentication, saves settings, or saves the real YAML.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get("DSH_WEB_URL", "")
if not URL:
    raise SystemExit("Set DSH_WEB_URL to the current authenticated local Harness URL")
OUTPUT = Path(os.environ.get("DSH_TEST_OUTPUT", "/tmp/cliproxyapi-plus-e2e"))
OUTPUT.mkdir(parents=True, exist_ok=True)
CHROMIUM = os.environ.get(
    "CHROMIUM_EXECUTABLE",
    "/Users/liuming.liu/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell",
)
checks = []
errors = []


def check(name, condition):
    assert condition, name
    checks.append(name)
    print(f"PASS {name}")


INIT_SCRIPT = r"""
(() => {
  let facade
  Object.defineProperty(window, '__ModuleLoader__', { configurable: true, get: () => facade, set(value) {
    facade = value
    const wrap = load => function(registration) {
      if (registration.id === 'cliproxyapi-plus') {
        const original = registration.factory
        registration = { ...registration, factory(require) {
          const plugin = original(require)
          return { ...plugin, apply(ctx) {
            window.__cliproxyTestContext = ctx
            return plugin.apply(ctx)
          } }
        } }
      }
      return load.call(this, registration)
    }
    let load = wrap(value.load)
    Object.defineProperty(value, 'load', { configurable: true, get: () => load, set(next) { load = wrap(next) } })
  } })
})()
"""

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=CHROMIUM)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.add_init_script(INIT_SCRIPT)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" and "cliproxyapi-plus" in message.text else None)
    original = {}
    try:
        response = page.goto(URL)
        if response and response.status == 401:
            raise RuntimeError("The authenticated Harness URL is expired (401)")
        page.wait_for_load_state("networkidle", timeout=15000)
        page.wait_for_function("window.__cliproxyTestContext !== undefined", timeout=20000)
        original = page.evaluate("""() => ({
          locale: window.__cliproxyTestContext.locale.getSnapshot().active,
          theme: window.__cliproxyTestContext.get('theme').getTheme().preference,
        })""")
        metadata = page.evaluate("""async () => {
          const ctx = window.__cliproxyTestContext
          const result = await ctx.get('remote.pluginManager').listBundles()
          const bundle = result.value.find(row => row.name === 'cliproxyapi-plus')
          return bundle && { enabled: bundle.enabled, title: bundle.meta?.title, description: bundle.meta?.description }
        }""")
        check("installed bundle is enabled with display metadata", bool(metadata and metadata["enabled"] and metadata["title"] == "CLI Proxy"))
        page.evaluate("""() => {
          const ctx = window.__cliproxyTestContext
          ctx.locale.setLocale('zh')
          ctx.get('theme').setTheme('light')
        }""")
        page.get_by_role("button", name="CLI Proxy", exact=True).first.click()
        page.locator("[data-cliproxyapi-plus]").wait_for(timeout=15000)
        check("sidebar opens the native overview by default", page.locator(".cpa-overview").is_visible())
        check("overview shows handled requests and traffic", page.locator(".cpa-request-total").is_visible() and page.locator(".cpa-traffic").is_visible())
        snapshot = page.evaluate("""async () => {
          const response = await window.__cliproxyTestContext.get('remote.cliproxyapiPlus').snapshot()
          if (!response.ok) throw new Error(response.error?.message || 'snapshot failed')
          return response.value
        }""")
        check("RPC reads the configured YAML without authentication", snapshot["config"]["ok"] and snapshot["config"]["path"].endswith("config.yaml"))
        serialized = json.dumps(snapshot, ensure_ascii=False)
        check("overview contains no token or secret fields", all(word not in serialized for word in ["refresh_token", "access_token", "secret-key", "machine_token"]))
        page.screenshot(path=str(OUTPUT / "overview-zh-light.png"), full_page=True)

        page.get_by_role("button", name="凭证", exact=True).click()
        check("credential page opens", page.get_by_role("heading", name="凭证", exact=True).is_visible())
        page.get_by_role("button", name="配置", exact=True).click()
        editor = page.locator(".cm-content")
        editor.wait_for(timeout=10000)
        source = page.evaluate("""async () => {
          const response = await window.__cliproxyTestContext.get('remote.cliproxyapiPlus').readConfig()
          if (!response.ok) throw new Error(response.error?.message || 'readConfig failed')
          return response.value.text
        }""")
        check("YAML editor loads real configuration with line numbers", "config-version" in source and page.locator(".cm-lineNumbers .cm-gutterElement").count() > 1)
        editor.click()
        page.keyboard.press("Control+End")
        page.keyboard.type("\n# browser-validation-only\n")
        page.get_by_role("button", name="校验 YAML", exact=True).click()
        page.get_by_text("YAML 校验通过。", exact=True).wait_for()
        disk_source = page.evaluate("""async () => {
          const response = await window.__cliproxyTestContext.get('remote.cliproxyapiPlus').readConfig()
          if (!response.ok) throw new Error(response.error?.message || 'readConfig failed')
          return response.value.text
        }""")
        check("edited YAML validates without saving", "browser-validation-only" not in disk_source)
        page.screenshot(path=str(OUTPUT / "editor-zh-light.png"), full_page=True)
        page.once("dialog", lambda dialog: dialog.accept())
        page.get_by_role("button", name="重新加载", exact=True).click()
        page.wait_for_timeout(500)
        check("reload discards only the in-memory edit", "browser-validation-only" not in editor.inner_text() and "config-version" in editor.inner_text())

        page.get_by_role("button", name="运行日志", exact=True).click()
        check("activity view exposes bounded process output", page.locator(".cpa-log__body").count() == 2)
        page.evaluate("""() => {
          const ctx = window.__cliproxyTestContext
          ctx.locale.setLocale('en')
          ctx.get('theme').setTheme('dark')
        }""")
        page.get_by_role("button", name="Configuration", exact=True).click()
        page.locator(".cm-content").wait_for()
        check("English locale and dark theme render without untranslated keys", page.get_by_role("button", name="Save YAML", exact=True).is_visible())
        page.screenshot(path=str(OUTPUT / "editor-en-dark.png"), full_page=True)
        check("no browser runtime errors from the plugin", not errors)
    except Exception as error:
        page.screenshot(path=str(OUTPUT / "failure.png"), full_page=True)
        errors.append(str(error))
        raise
    finally:
        if original:
            page.evaluate("""original => {
              const ctx = window.__cliproxyTestContext
              if (ctx) {
                ctx.locale.setLocale(original.locale)
                ctx.get('theme').setTheme(original.theme)
              }
            }""", original)
        (OUTPUT / "browser.json").write_text(json.dumps({"checks": checks, "errors": errors}, ensure_ascii=False, indent=2))
        browser.close()
