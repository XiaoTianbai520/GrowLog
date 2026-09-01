"""End-to-end tests against a running debug Tauri build with isolated data.

Launch it with GROWLOG_TEST_DATA_DIR and WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=
--remote-debugging-port=9222. No browser mock or AI service is used.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=9222)
parser.add_argument('--output', default='test-results')
args = parser.parse_args()
output = Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{args.port}')
    page = browser.contexts[0].pages[0]
    page.wait_for_load_state('networkidle')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def invoke(command, payload=None):
        return page.evaluate('([command,args]) => window.__TAURI_INTERNALS__.invoke(command,args)', [command, payload or {}])

    def save():
        page.keyboard.press('Control+s')
        expect(page.locator('.save-indicator')).to_have_text('已保存', timeout=10000)

    def nav(name):
        page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()

    def screenshot(name):
        page.screenshot(path=str(output / name), full_page=True)

    # Existing test fixtures are not silently cleared. Use a new test data directory.
    assert len(invoke('bootstrap')['notes']) == 0, 'Use a fresh GROWLOG_TEST_DATA_DIR'
    screenshot('01-home-empty.png')
    page.get_by_role('button', name='写下第一篇').click()
    page.get_by_label('笔记标题', exact=True).fill('让记录成为日常')
    body = '# 让记录成为日常\n\n每个想法，都值得一个安静的位置。\n\n## 今天的小小收获\n\n- 找到一种适合自己的记录方式\n- 给长期目标留一点耐心\n\n> 不必一次做很多，持续记录就是生长。\n\n## 下次继续\n\n- [x] 写下第一篇笔记\n- [ ] 整理今天的学习心得\n\n| 方向 | 下一小步 |\n| --- | --- |\n| 学习 | 读完一章 |\n| 生活 | 留意一个小发现 |'
    page.locator('.cm-content').fill(body)
    save()
    expect(page.get_by_label('笔记预览').get_by_role('heading', name='今天的小小收获')).to_be_visible()
    data = invoke('bootstrap')
    first_id = data['notes'][0]['id']
    assert data['writtenCount'] == 1
    assert sum(a['unlockedAt'] is not None for a in data['achievements']) == 1
    page.get_by_label('收藏笔记', exact=True).click()
    page.get_by_label('添加标签', exact=True).fill('生活')
    page.get_by_label('添加标签', exact=True).press('Enter')
    save()
    page.get_by_label('新建文件夹', exact=True).click()
    page.get_by_label('文件夹名称').fill('日常记录')
    page.get_by_role('button', name='创建文件夹', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    folder_id = invoke('bootstrap')['folders'][0]['id']
    page.get_by_label('所属文件夹').select_option(folder_id)
    save()
    screenshot('02-notes-light.png')

    # Two fast creates exercise flush-before-navigation using the real SQLite backend.
    page.locator('.cm-content').press('Control+End')
    page.keyboard.insert_text('\n\n快速切换之前的最后一句。')
    page.keyboard.press('Control+n')
    expect(page.get_by_label('笔记标题', exact=True)).to_have_value('')
    assert next(n for n in invoke('bootstrap')['notes'] if n['id'] == first_id)['body'].endswith('快速切换之前的最后一句。')
    page.get_by_label('笔记标题', exact=True).fill('本周阅读清单')
    page.locator('.cm-content').fill('## 本周阅读\n\n- [ ] 阅读一章\n- [ ] 记下一段喜欢的话')
    save()
    assert invoke('bootstrap')['writtenCount'] == 2

    # Paste a real PNG File. The app must copy it and render it through the asset scope.
    page.locator('.cm-content').press('Control+End')
    page.keyboard.insert_text('\n\n')
    png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII='
    page.locator('.cm-content').evaluate('''(element, base64) => {
        const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
        const data=new DataTransfer(); data.items.add(new File([bytes],'fixture.png',{type:'image/png'}));
        element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    }''', png)
    expect(page.locator('.cm-content')).to_contain_text('attachments/', timeout=10000)
    save()
    page.wait_for_function("document.querySelector('.markdown-preview img')?.naturalWidth > 0")
    assert len(list(Path(invoke('bootstrap')['attachmentDir']).glob('*.png'))) == 1

    # Remote images and raw HTML never execute or load automatically.
    page.locator('.cm-content').press('Control+End')
    page.keyboard.insert_text('\n\n![外部](https://example.com/test.png)\n\n<script>window.bad=true</script>')
    save()
    expect(page.get_by_text('图片未加载 · 仅显示已保存到本地的图片')).to_be_visible()
    assert page.evaluate('window.bad === undefined')

    nav('成就')
    page.get_by_role('button', name='添加成就', exact=True).first.click()
    page.get_by_label('成就名称', exact=True).fill('读完三本书')
    page.get_by_label('完成方式').select_option('counter')
    page.get_by_label('目标数量').fill('3')
    page.get_by_label('单位', exact=True).fill('本')
    page.get_by_role('dialog').get_by_role('button', name='添加成就', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    card = page.locator('.achievement-card').filter(has=page.get_by_role('heading', name='读完三本书'))
    card.get_by_role('button', name='更新进度').click()
    page.get_by_label('当前累计进度').fill('3')
    page.get_by_role('button', name='保存进度', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(card.locator('.achievement-status')).to_have_text('已获得')
    screenshot('03-achievements-light.png')

    # Create a custom automatic achievement after records already exist.
    page.get_by_role('button', name='添加成就', exact=True).first.click()
    page.get_by_label('成就名称', exact=True).fill('两页新的开始')
    page.get_by_label('完成方式').select_option('auto')
    page.get_by_label('目标数量').fill('2')
    page.get_by_role('dialog').get_by_role('button', name='添加成就', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.locator('.achievement-card').filter(has=page.get_by_role('heading', name='两页新的开始')).locator('.achievement-status')).to_have_text('已获得')

    # Search in Chinese through the command palette; trash and restore without recounting.
    page.keyboard.press('Control+k')
    page.get_by_label('全局搜索', exact=True).fill('快速切换之前')
    page.get_by_label('全局搜索', exact=True).press('Enter')
    expect(page.get_by_label('笔记标题', exact=True)).to_have_value('让记录成为日常')
    page.get_by_role('button', name='移到回收站', exact=True).click()
    expect(page.locator('.trash-notice')).to_be_visible()
    page.locator('.trash-notice').get_by_role('button', name='恢复', exact=True).click()
    expect(page.locator('.trash-notice')).to_have_count(0)
    assert invoke('bootstrap')['writtenCount'] == 2

    # Native backup API roundtrip; UI reload confirms persisted settings and notes.
    backup = str(output / 'desktop-roundtrip.zhixu')
    invoke('export_backup', {'path': backup})
    original_body = invoke('bootstrap')['notes'][0]['body']
    page.locator('.cm-content').fill('恢复测试期间的临时内容')
    save()
    invoke('restore_backup', {'path': backup})
    page.reload()
    page.wait_for_load_state('networkidle')
    assert invoke('bootstrap')['notes'][0]['body'] == original_body
    nav('工作台')
    screenshot('04-home-populated.png')
    page.get_by_role('button', name='设置', exact=True).click()
    page.get_by_role('button', name='深色', exact=True).click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
    screenshot('05-settings-dark.png')
    nav('成就')
    screenshot('06-achievements-dark.png')

    # Emulate 125% and 150% scale viewports while keeping desktop page state.
    cdp = browser.contexts[0].new_cdp_session(page)
    for width, height, scale in [(1088, 720, 1.25), (907, 640, 1.5)]:
        cdp.send('Emulation.setDeviceMetricsOverride', {'width': width, 'height': height, 'deviceScaleFactor': scale, 'mobile': False})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        screenshot(f'07-dark-scale-{scale}.png')
    cdp.send('Emulation.clearDeviceMetricsOverride')
    assert errors == [], errors
    (output / 'desktop-test-report.json').write_text(json.dumps({'result': 'passed', 'pageErrors': errors, 'writtenCount': invoke('bootstrap')['writtenCount'], 'scenarios': ['real native IPC', 'Chinese Markdown', 'save before switch', 'folders/tags/favorites', 'paste local image', 'remote content blocked', 'manual and automatic achievements', 'search', 'trash/restore', 'backup roundtrip', 'themes', 'scale viewports']}, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Desktop end-to-end scenarios passed.')
    browser.close()
