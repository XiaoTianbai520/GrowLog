import json
import sqlite3
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9222')
    page = browser.contexts[0].pages[0]
    snapshot = page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")
    root = Path(snapshot['dataDir'])
    assert '.tools' in str(root), 'Only run lifecycle tests against isolated data'
    page.keyboard.press('Control+k')
    page.get_by_label('全局搜索').fill('让记录成为日常')
    page.get_by_label('全局搜索').press('Enter')
    expect(page.get_by_label('笔记标题', exact=True)).to_have_value('让记录成为日常')
    page.locator('.cm-content').fill('正常关闭前还未到自动保存时间的内容。')
    expect(page.locator('.save-indicator')).to_have_text('等待保存')
    try:
        with page.expect_event('close', timeout=10000):
            page.evaluate("window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'})")
    except Exception as error:
        if not page.is_closed():
            raise error
    browser.close()
    # Database can be opened independently after graceful shutdown.
    with sqlite3.connect(root / 'content' / 'growlog.sqlite') as connection:
        body = connection.execute('SELECT body FROM notes WHERE title=?', ('让记录成为日常',)).fetchone()[0]
        assert body == '正常关闭前还未到自动保存时间的内容。', body
    Path('test-results/close-test-report.json').write_text(json.dumps({'pendingSaveOnClose': 'passed'}, indent=2), encoding='utf-8')
    print('Pending save on native window close passed.')
