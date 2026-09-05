"""Live Markdown interactions in a real Tauri WebView with an isolated database."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

output = Path('test-results').resolve()
output.mkdir(exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp('http://127.0.0.1:9222')
    page = browser.contexts[0].pages[0]
    page.wait_for_load_state('networkidle')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.get_by_role('navigation', name='主导航').get_by_role('button', name='笔记').click()
    page.get_by_label('新建笔记', exact=True).click()
    expect(page.get_by_label('笔记标题', exact=True)).to_have_value('')
    page.get_by_label('笔记标题', exact=True).fill('原位编辑回归')
    page.get_by_role('button', name='原位编辑', exact=True).click()
    editor = page.locator('.cm-content')
    editor.click()
    page.keyboard.insert_text('# 回车标题')
    expect(page.locator('.live-preview h1')).to_have_count(0)
    page.keyboard.press('Enter')
    expect(page.locator('.live-preview h1')).to_have_text('回车标题')
    page.keyboard.insert_text('**中文粗体**')
    page.keyboard.press('Enter')
    expect(page.locator('.live-preview strong')).to_have_text('中文粗体')
    heading_preview = page.locator('.live-preview h1')
    heading_preview.click()
    expect(heading_preview).to_be_visible()
    heading_preview.dblclick()
    expect(page.locator('.cm-line').filter(has_text='# 回车标题')).to_be_visible()
    page.keyboard.press('Control+End')
    page.keyboard.press('ArrowUp')
    expect(page.locator('.cm-line').filter(has_text='**中文粗体**')).to_be_visible()
    page.keyboard.press('Control+End')
    page.keyboard.insert_text('- 项目')
    page.keyboard.press('Enter')
    expect(page.locator('.cm-line').last).to_have_text('- ')
    page.keyboard.press('Enter')
    page.keyboard.insert_text('最后一行')
    page.keyboard.press('Control+z')
    page.keyboard.press('Control+y')
    expect(page.locator('.cm-line').last).to_have_text('最后一行')
    page.keyboard.press('Control+a')
    expect(page.locator('.live-preview')).to_have_count(0)
    original = editor.inner_text()
    page.keyboard.press('ArrowRight')
    page.keyboard.press('Control+s')
    expect(page.locator('.save-indicator')).to_have_text('已保存')
    snapshot = page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")
    note = next(note for note in snapshot['notes'] if note['title'] == '原位编辑回归')
    assert note['body'] == original, (note['body'], original)
    page.get_by_role('button', name='源码', exact=True).click()
    expect(page.locator('.live-preview')).to_have_count(0)
    expect(editor).to_have_text(original, use_inner_text=True)
    page.get_by_role('button', name='阅读', exact=True).click()
    expect(page.get_by_label('笔记预览').locator('h1')).to_have_text('回车标题')
    page.get_by_role('button', name='原位编辑', exact=True).click()
    # Exercise an actual IME composition path through Chromium's input protocol.
    editor.press('Control+End')
    page.keyboard.press('Enter')
    cdp = browser.contexts[0].new_cdp_session(page)
    cdp.send('Input.imeSetComposition', {'text': '输入法', 'selectionStart': 3, 'selectionEnd': 3})
    cdp.send('Input.insertText', {'text': '输入法'})
    page.keyboard.press('Enter')
    expect(page.locator('.live-preview').filter(has_text='输入法')).to_be_visible()
    # Whole tables and code blocks stay rendered after one click and return to
    # source only after a double-click.
    page.get_by_role('button', name='源码', exact=True).click()
    fixture = '# 标题\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```ts\nconst n = 1;\n```\n\n![外部图片](https://example.com/a.png)\n\n结尾\n'
    editor.fill(fixture)
    editor.press('Control+End')
    page.get_by_role('button', name='原位编辑', exact=True).click()
    expect(page.locator('.live-preview table')).to_be_visible()
    expect(page.locator('.live-preview pre')).to_be_visible()
    expect(page.locator('.blocked-image')).to_be_visible()
    table_cell = page.locator('.live-preview td').first
    table_cell.click()
    expect(page.locator('.live-preview table')).to_be_visible()
    table_cell.dblclick()
    expect(page.locator('.live-preview table')).to_have_count(0)
    expect(page.locator('.cm-line').filter(has_text='| --- | --- |')).to_be_visible()
    editor.press('Control+End')
    code_preview = page.locator('.live-preview pre')
    code_preview.click()
    expect(code_preview).to_be_visible()
    code_preview.dblclick()
    expect(page.locator('.cm-line').filter(has_text='const n = 1;')).to_be_visible()
    editor.press('Control+End')
    page.keyboard.press('Control+s')
    expect(page.locator('.save-indicator')).to_have_text('已保存')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('navigation', name='主导航').get_by_role('button', name='笔记').click()
    page.locator('.note-list-item').filter(has_text='原位编辑回归').click()
    assert next(n for n in page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")['notes'] if n['id'] == note['id'])['body'] == fixture
    for theme in ['light', 'dark']:
        page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
        page.screenshot(path=str(output / f'live-markdown-{theme}.png'), full_page=True, animations='disabled')
    cdp = browser.contexts[0].new_cdp_session(page)
    cdp.send('Emulation.setDeviceMetricsOverride', {'width': 907, 'height': 640, 'deviceScaleFactor': 1.5, 'mobile': False})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(output / 'live-markdown-narrow.png'), full_page=True, animations='disabled')
    cdp.send('Emulation.clearDeviceMetricsOverride')
    # A drop lands in the existing source document and loads the managed copy.
    editor = page.locator('.cm-content')
    editor.press('Control+End')
    editor.evaluate('''element => {
        const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], 'drop.png', {type: 'image/png'}));
        const rect = element.getBoundingClientRect();
        element.dispatchEvent(new DragEvent('drop', {dataTransfer: data, bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.bottom - 20}));
    }''')
    page.get_by_role('button', name='源码', exact=True).click()
    expect(editor).to_contain_text('attachments/')
    editor.press('Control+End')
    page.keyboard.press('Enter')
    page.get_by_role('button', name='原位编辑', exact=True).click()
    expect(page.locator('.live-preview img').first).to_have_js_property('naturalWidth', 1)
    page.get_by_label('新建文件夹', exact=True).click()
    page.get_by_label('文件夹名称', exact=True).fill('原位跳转')
    page.get_by_role('dialog').get_by_role('button', name='创建文件夹', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.get_by_label('所属文件夹').select_option(label='原位跳转')
    page.keyboard.press('Control+s')
    expect(page.locator('.save-indicator')).to_have_text('已保存')
    page.locator('.folder-row > button').filter(has_text='原位跳转').click()
    page.get_by_role('button', name='导图', exact=True).click()
    page.locator('.heading-node').filter(has_text='标题').click()
    expect(page.locator('.cm-line').filter(has_text='# 标题')).to_be_visible()
    # Adjacent preview lines must not gain empty source rows or inherited HTML whitespace.
    page.get_by_role('button', name='源码', exact=True).click()
    editor.fill('第一行 **粗体**\n第二行 **粗体**\n第三行\n')
    editor.press('Control+End')
    page.get_by_role('button', name='原位编辑', exact=True).click()
    expect(page.locator('.live-preview p').first).to_be_visible()
    spacing = page.locator('.live-preview p').evaluate_all('''nodes => {
        const a = nodes[0].getBoundingClientRect(), b = nodes[1].getBoundingClientRect();
        return {step: b.top - a.top, height: a.height};
    }''')
    assert 20 <= spacing['step'] <= 27, spacing
    assert spacing['step'] <= spacing['height'] + 2, spacing
    # The editor must own a bounded scroll viewport based on rendered table height.
    page.get_by_role('button', name='源码', exact=True).click()
    tall_table = '| A | B |\n| --- | --- |\n' + '| 内容 | 内容 |\n' * 35 + '\n末尾标记\n'
    editor.fill(tall_table)
    editor.press('Control+End')
    page.get_by_role('button', name='原位编辑', exact=True).click()
    editor.press('Control+End')
    expect(page.locator('.live-preview table')).to_have_count(1)
    scroller = page.locator('.cm-scroller')
    dimensions = scroller.evaluate('''el => ({height: el.clientHeight, total: el.scrollHeight,
        pane: el.closest('.source-pane').clientHeight,
        table: el.querySelector('table').getBoundingClientRect().height})''')
    assert 0 < dimensions['height'] < dimensions['pane'], dimensions
    assert dimensions['total'] >= dimensions['table'] > dimensions['height'], dimensions
    scroller.evaluate('el => { el.scrollTop = 0; }')
    scroller.hover()
    page.mouse.wheel(0, 500)
    expect(page.locator('.live-preview table')).to_be_visible()
    # Web-first polling avoids relying on wheel-event timing.
    expect(scroller).not_to_have_js_property('scrollTop', 0)
    editor.press('Control+End')
    expect(page.locator('.cm-line').last).to_be_in_viewport()
    page.keyboard.press('Control+s')
    expect(page.locator('.save-indicator')).to_have_text('已保存')
    assert next(n for n in page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")['notes'] if n['id'] == note['id'])['body'] == tall_table
    page.screenshot(path=str(output / 'live-markdown-scroll.png'), animations='disabled')
    # A long document should stay editable and render only the visible widgets.
    page.get_by_role('button', name='源码', exact=True).click()
    page.locator('.cm-content').fill(('## 长笔记\n\n内容 **粗体**\n\n' * 500) + '\n结束')
    page.get_by_role('button', name='原位编辑', exact=True).click()
    page.locator('.cm-content').press('Control+End')
    page.keyboard.insert_text('继续输入')
    expect(page.locator('.cm-line').last).to_contain_text('继续输入')
    assert page.locator('.live-preview').count() < 100
    assert errors == [], errors
    (output / 'live-markdown-report.json').write_text(json.dumps({'result': 'passed', 'pageErrors': errors, 'scenarios': ['Enter preview', 'double-click and keyboard source recovery', 'single-click preview retention', 'selection', 'undo redo', 'source preservation', 'three modes', 'IME', 'tables and code', 'blocked remote images', 'reload', 'themes', 'narrow viewport', 'image drop', 'mind map jump', 'long document']}, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Live Markdown desktop scenarios passed.')
    browser.close()
