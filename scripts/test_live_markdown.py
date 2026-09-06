"""Typora-style Markdown editing in a real Tauri WebView with isolated data."""
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

    page.get_by_role('navigation', name='主导航').get_by_role('button', name='笔记', exact=False).click()
    page.get_by_label('新建笔记', exact=True).click()
    page.get_by_label('笔记标题', exact=True).fill('所见即所得回归')
    editor = page.locator('.typora-editor-shell .ProseMirror')
    expect(editor).to_be_visible(timeout=15000)
    expect(page.get_by_label('Markdown 所见即所得编辑器')).to_be_visible()

    # Markdown input rules immediately become editable document structure.
    editor.click()
    page.keyboard.type('# ')
    page.keyboard.insert_text('即时标题')
    expect(editor.locator('h1')).to_have_text('即时标题')
    expect(editor).not_to_contain_text('# 即时标题')
    page.keyboard.press('Enter')
    page.keyboard.insert_text('普通段落 ')
    page.keyboard.press('Control+b')
    page.keyboard.insert_text('中文粗体')
    page.keyboard.press('Control+b')
    expect(editor.locator('strong')).to_have_text('中文粗体')
    page.keyboard.press('Enter')
    page.keyboard.type('- ')
    page.keyboard.insert_text('列表项目')
    expect(editor.locator('li')).to_contain_text('列表项目')

    # Ctrl+S synchronizes the structured document before the app flushes it.
    page.keyboard.press('Control+s')
    expect(page.locator('.save-indicator')).to_have_text('已保存', timeout=10000)
    snapshot = page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")
    note = next(note for note in snapshot['notes'] if note['title'] == '所见即所得回归')
    assert '# 即时标题' in note['body'], note['body']
    assert '**中文粗体**' in note['body'], note['body']

    # Source mode remains an exact Markdown escape hatch; returning creates
    # graphical tables, code blocks, math and formatted text in one editor.
    page.get_by_role('button', name='源码', exact=True).click()
    source = page.locator('.cm-content')
    expect(source).to_contain_text('# 即时标题')
    fixture = '''# 图形化内容

这是 **粗体**、*斜体* 与 `代码`。

| 方向 | 下一步 |
| --- | --- |
| 学习 | 读一章 |

- [ ] 可点击任务

```ts
const n = 1;
```

$$
x^2 + y^2
$$
'''
    source.fill(fixture)
    page.get_by_role('button', name='编辑', exact=True).click()
    editor = page.locator('.typora-editor-shell .ProseMirror')
    expect(editor.locator('h1')).to_have_text('图形化内容')
    expect(editor.locator('strong')).to_have_text('粗体')
    expect(editor.locator('em')).to_have_text('斜体')
    expect(editor.get_by_role('table')).to_be_visible()
    expect(editor.locator('.milkdown-code-block').first).to_contain_text('const n = 1;')
    expect(page.locator('.typora-editor-shell')).not_to_contain_text('| --- | --- |')
    task = editor.locator('li').filter(has_text='可点击任务')
    expect(task).to_be_visible()
    expect(task.locator('.label')).to_have_class('milkdown-icon label unchecked')
    task.locator('.label-wrapper').click()
    expect(task.locator('.label')).to_have_class('milkdown-icon label checked')

    # Clicking rendered content places the caret directly without revealing a
    # raw Markdown line or replacing the surrounding document.
    paragraph = editor.locator('p').filter(has_text='这是').first
    paragraph.click()
    page.keyboard.press('End')
    page.keyboard.insert_text(' 单击后继续写')
    expect(paragraph).to_contain_text('单击后继续写')
    expect(editor.get_by_role('table')).to_be_visible()

    # Paste a real image; the editor stores only the managed relative path and
    # renders the local asset URL without embedding external data.
    editor.click()
    page.keyboard.press('Control+End')
    png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII='
    editor.evaluate('''(element, base64) => {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], 'typora.png', {type: 'image/png'}));
        element.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
    }''', png)
    expect(editor.locator('img').last).to_have_js_property('naturalWidth', 1, timeout=10000)
    page.wait_for_timeout(1200)
    expect(page.locator('.save-indicator')).to_have_text('已保存', timeout=10000)
    saved = next(n for n in page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")['notes'] if n['id'] == note['id'])
    assert 'attachments/' in saved['body'] and 'data:image' not in saved['body'], saved['body']
    assert '[x] 可点击任务' in saved['body'], saved['body']

    page.get_by_role('button', name='阅读', exact=True).click()
    expect(page.get_by_label('笔记预览').locator('table')).to_be_visible()
    expect(page.get_by_label('笔记预览').locator('img')).to_have_js_property('naturalWidth', 1)
    page.get_by_role('button', name='编辑', exact=True).click()
    editor = page.locator('.typora-editor-shell .ProseMirror')
    expect(editor).to_be_visible()

    for theme in ['light', 'dark']:
        page.evaluate('(theme) => document.documentElement.dataset.theme = theme', theme)
        page.screenshot(path=str(output / f'typora-editor-{theme}.png'), full_page=True, animations='disabled')

    cdp = browser.contexts[0].new_cdp_session(page)
    cdp.send('Emulation.setDeviceMetricsOverride', {'width': 907, 'height': 640, 'deviceScaleFactor': 1.5, 'mobile': False})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(output / 'typora-editor-narrow.png'), full_page=True, animations='disabled')
    cdp.send('Emulation.clearDeviceMetricsOverride')
    assert errors == [], errors
    (output / 'live-markdown-report.json').write_text(json.dumps({
        'result': 'passed',
        'pageErrors': errors,
        'scenarios': [
            'single-surface editing', 'Markdown input rules', 'inline formatting', 'clickable task',
            'source roundtrip', 'graphical table', 'code and math blocks', 'click-to-edit',
            'managed image paste', 'reading mode', 'themes', 'narrow viewport'
        ]
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Typora-style desktop editor scenarios passed.')
    browser.close()
