"""Verify graceful-save persistence, then kill/relaunch only our own debug child."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

workspace = Path(__file__).resolve().parents[1]
data_root = workspace / '.tools' / 'desktop-test'
assert data_root.is_relative_to(workspace / '.tools')
env = os.environ.copy()
env['GROWLOG_TEST_DATA_DIR'] = str(data_root)
env['WEBVIEW2_USER_DATA_FOLDER'] = str(workspace / '.tools' / 'webview-lifecycle')
env['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-port=9222'
startup = subprocess.STARTUPINFO()
startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
startup.wShowWindow = subprocess.SW_HIDE

def launch():
    child = subprocess.Popen([str(workspace / 'src-tauri/target/debug/growlog.exe')], env=env, startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW)
    for _ in range(60):
        if child.poll() is not None:
            raise RuntimeError(f'Test desktop exited: {child.returncode}')
        try:
            with urllib.request.urlopen('http://127.0.0.1:9222/json', timeout=1) as response:
                if json.load(response):
                    return child
        except OSError:
            pass
        time.sleep(0.25)
    child.terminate()
    raise RuntimeError('Desktop CDP did not become ready')

with sync_playwright() as p:
    child = launch()
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9222')
    page = browser.contexts[0].pages[0]
    page.wait_for_load_state('networkidle')
    data = page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")
    assert next(n for n in data['notes'] if n['title'] == '让记录成为日常')['body'] == '正常关闭前还未到自动保存时间的内容。'
    page.keyboard.press('Control+k')
    page.get_by_label('全局搜索').fill('让记录成为日常')
    page.get_by_label('全局搜索').press('Enter')
    page.locator('.cm-content').fill('已保存，强制退出后仍应存在。')
    page.keyboard.press('Control+s')
    expect(page.locator('.save-indicator')).to_have_text('已保存')
    # Terminate only the child created above; never touch another running app.
    child.kill()
    child.wait(timeout=10)
    try:
        browser.close()
    except Exception:
        pass
    child = launch()
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9222')
    page = browser.contexts[0].pages[0]
    page.wait_for_load_state('networkidle')
    data = page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")
    assert next(n for n in data['notes'] if n['title'] == '让记录成为日常')['body'] == '已保存，强制退出后仍应存在。'
    assert data['writtenCount'] == 2
    try:
        page.evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})")
        child.wait(timeout=10)
    finally:
        if child.poll() is None:
            child.terminate()
        try:
            browser.close()
        except Exception:
            pass
    (workspace / 'test-results/lifecycle-test-report.json').write_text(json.dumps({'restartAfterGracefulClose':'passed','persistedAfterForcedTermination':'passed','duplicateAchievementsOnRestart':False},indent=2),encoding='utf-8')
    print('Relaunch and forced termination persistence passed.')
