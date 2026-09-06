"""Exercise save failure recovery against actual SQLite, and local file import."""
import base64
import json
import sqlite3
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

output = Path('test-results').resolve()
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9222')
    page = browser.contexts[0].pages[0]
    page.keyboard.press('Control+k')
    page.get_by_label('全局搜索').fill('让记录成为日常')
    page.get_by_label('全局搜索').press('Enter')
    expect(page.get_by_label('笔记标题', exact=True)).to_have_value('让记录成为日常（已重命名）')
    snapshot = page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")
    root = Path(snapshot['dataDir'])
    assert '.tools' in str(root)
    database = root / 'content/growlog.sqlite'
    original = next(n for n in snapshot['notes'] if n['title'] == '让记录成为日常（已重命名）')

    # Inject a write failure only into the isolated database, then remove it in finally.
    try:
        with sqlite3.connect(database) as db:
            db.execute("CREATE TRIGGER qa_write_failure BEFORE UPDATE ON notes BEGIN SELECT RAISE(ABORT,'test disk write failure'); END;")
        page.locator('.cm-content').fill('保存失败时，必须留住我的草稿。')
        expect(page.locator('.save-indicator')).to_have_text('保存失败', timeout=10000)
        page.get_by_role('navigation', name='主导航').get_by_role('button', name='工作台', exact=True).click()
        expect(page.locator('.save-error')).to_be_visible()
        expect(page.locator('.cm-content')).to_have_text('保存失败时，必须留住我的草稿。')
        with sqlite3.connect(database) as db:
            assert db.execute('SELECT body FROM notes WHERE id=?', (original['id'],)).fetchone()[0] == original['body']
    finally:
        with sqlite3.connect(database) as db:
            db.execute('DROP TRIGGER IF EXISTS qa_write_failure')
    page.get_by_role('button', name='重试保存', exact=True).click()
    expect(page.locator('.save-indicator')).to_have_text('已保存')
    page.get_by_label('关闭错误提示').click()

    # Load an image from a source file, remove that source, and render the managed copy.
    source = output / 'source-image.png'
    source.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII='))
    imported = page.evaluate("args => window.__TAURI_INTERNALS__.invoke('import_image_file',args)", {'noteId': original['id'], 'path': str(source)})
    source.unlink()
    page.locator('.cm-content').fill(original['body'] + f"\n\n![本地图片]({imported['markdownPath']})")
    page.keyboard.press('Control+s')
    expect(page.locator('.save-indicator')).to_have_text('已保存')
    page.get_by_role('button', name='阅读', exact=True).click()
    expect(page.locator('.markdown-preview img').first).to_have_js_property('naturalWidth', 1)
    expect(page.locator('.source-pane')).to_have_count(0)
    page.get_by_role('button', name='源码', exact=True).click()
    expect(page.locator('.preview-pane')).to_have_count(0)
    page.get_by_role('button', name='原位编辑', exact=True).click()
    browser_width = page.locator('.note-browser').evaluate('element => element.getBoundingClientRect().width')
    document_width = page.locator('.note-document').evaluate('element => element.getBoundingClientRect().width')
    page.get_by_label('收起笔记列表', exact=True).click()
    expect(page.locator('.note-browser')).not_to_be_visible()
    expect(page.get_by_label('展开笔记列表', exact=True)).to_be_visible()
    assert page.locator('.note-browser').evaluate('element => element.matches(\":not(:focus-within)\")')
    expanded_document_width = page.locator('.note-document').evaluate('element => element.getBoundingClientRect().width')
    assert browser_width > 0 and expanded_document_width > document_width, (browser_width, document_width, expanded_document_width)
    page.get_by_label('收起导航', exact=True).click()
    expect(page.locator('.global-sidebar')).not_to_be_visible()
    widest_document = page.locator('.note-document').evaluate('element => element.getBoundingClientRect().width')
    assert widest_document > expanded_document_width, (widest_document, expanded_document_width)
    page.screenshot(path=str(output / '08-notes-dark-focus.png'), full_page=True)
    page.get_by_label('展开导航', exact=True).click()
    page.get_by_label('展开笔记列表', exact=True).click()
    expect(page.locator('.note-browser')).to_be_visible()
    cdp = browser.contexts[0].new_cdp_session(page)
    for width,height,scale in [(1088,720,1.25),(907,640,1.5)]:
        cdp.send('Emulation.setDeviceMetricsOverride', {'width':width,'height':height,'deviceScaleFactor':scale,'mobile':False})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(output / f'09-notes-scale-{scale}.png'), full_page=True)
    cdp.send('Emulation.clearDeviceMetricsOverride')
    (output / 'editor-safety-report.json').write_text(json.dumps({'sqliteWriteFailureRetainsDraft':'passed','navigationBlockedUntilRetry':'passed','sourceImageRemoval':'passed','threeEditorModes':'passed','collapsedNavigation':'passed','collapsedNotebook':'passed','combinedFocusWidth':'passed','noteScaleViewports':'passed'},indent=2),encoding='utf-8')
    print('Real save-failure recovery, image-source removal and editor modes passed.')
    browser.close()
