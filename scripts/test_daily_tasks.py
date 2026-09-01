"""Real Tauri WebView test. Requires a fresh isolated debug app on port 9224."""
import json
import sqlite3
from datetime import date, timedelta
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

workspace = Path(__file__).resolve().parents[1]
output = workspace / 'test-results/daily-tasks'
output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp('http://127.0.0.1:9224')
    page = browser.contexts[0].pages[0]
    page.wait_for_load_state('networkidle')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def snapshot():
        return page.evaluate("window.__TAURI_INTERNALS__.invoke('bootstrap')")
    initial = snapshot()
    root = Path(initial['dataDir']).resolve()
    assert root.is_relative_to((workspace / '.tools').resolve()), 'Never test against real user data'
    assert initial['growth']['totalXp'] == 0 and not initial['notes'], 'Use fresh test data'
    db_path = root / 'content/growlog.sqlite'
    page.get_by_role('button', name='每日任务', exact=True).click()
    expect(page.get_by_role('heading', name='每日任务', exact=True)).to_be_visible()
    expect(page.get_by_text('还没有经验记录，完成今天的第一个任务吧。')).to_be_visible()
    page.screenshot(path=str(output / 'empty-light.png'), full_page=True)

    with sqlite3.connect(db_path) as db:
        db.execute("CREATE TRIGGER reject_xp BEFORE INSERT ON experience_events BEGIN SELECT RAISE(ABORT,'test experience failure'); END")
    db.close()
    page.get_by_role('button', name='签到 +10 经验', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('test experience failure')
    expect(page.get_by_role('button', name='签到 +10 经验', exact=True)).to_be_enabled()
    assert snapshot()['growth']['totalXp'] == 0
    with sqlite3.connect(db_path) as db:
        db.execute('DROP TRIGGER reject_xp')
    db.close()
    page.get_by_role('button', name='关闭错误提示').click()
    page.get_by_role('button', name='签到 +10 经验', exact=True).click()
    expect(page.get_by_role('button', name='今日已签到', exact=True)).to_be_disabled()
    expect(page.get_by_role('status')).to_contain_text('+10 经验')
    repeat = page.evaluate("window.__TAURI_INTERNALS__.invoke('mutate', {mutation:{kind:'checkIn'}})")
    assert repeat['xpEarned'] == 0 and repeat['growth']['totalXp'] == 10
    page.get_by_role('button', name='去记笔记', exact=True).click()
    expect(page.locator('.cm-content')).to_be_visible()
    assert snapshot()['growth']['totalXp'] == 10, 'Empty notes award nothing'
    page.get_by_label('笔记标题', exact=True).fill('今天，开始积累经验')
    page.locator('.cm-content').fill('# 每天一点\n\n今天写下一段新的想法，记录也成为了成长。')
    page.keyboard.press('Control+s')
    expect(page.locator('.save-indicator')).to_have_text('已保存')
    expect(page.get_by_role('status')).to_contain_text('+30 经验')
    page.get_by_role('button', name='每日任务', exact=True).click()
    expect(page.get_by_role('button', name='今日已记录', exact=True)).to_be_disabled()
    assert snapshot()['growth']['totalXp'] == 40
    expect(page.locator('.experience-history li')).to_have_count(2)
    page.screenshot(path=str(output / 'completed-light.png'), full_page=True)

    # Reload is a fresh renderer read; no task is awarded a second time.
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='每日任务', exact=True).click()
    expect(page.get_by_role('button', name='今日已签到', exact=True)).to_be_disabled()
    assert snapshot()['growth']['totalXp'] == 40
    backup = str(root.parent / 'daily-roundtrip.zhixu')
    page.evaluate("path => window.__TAURI_INTERNALS__.invoke('export_backup',{path})", backup)
    page.evaluate("path => window.__TAURI_INTERNALS__.invoke('restore_backup',{path})", backup)
    restored = page.evaluate("window.__TAURI_INTERNALS__.invoke('mutate',{mutation:{kind:'checkIn'}})")
    assert restored['growth']['totalXp'] == 40 and restored['xpEarned'] == 0

    # Seed an isolated, valid 90-XP fixture to verify the actual level-up interaction.
    today = date.fromisoformat(restored['growth']['day'])
    with sqlite3.connect(db_path) as db:
        db.execute('DELETE FROM experience_events')
        for offset in (1, 2, 3):
            day = str(today - timedelta(days=offset))
            db.execute('INSERT INTO experience_events VALUES (?,?,?,?)', (day, 'write-note', 30, day + 'T12:00:00Z'))
    db.close()
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='每日任务', exact=True).click()
    expect(page.locator('.level-heading h2')).to_have_text('Lv. 1')
    page.get_by_role('button', name='签到 +10 经验', exact=True).click()
    expect(page.locator('.level-heading h2')).to_have_text('Lv. 2')
    expect(page.get_by_role('status')).to_contain_text('升至 Lv. 2')
    assert snapshot()['growth']['levelXp'] == 0

    page.get_by_role('button', name='设置', exact=True).click()
    page.get_by_role('button', name='深色', exact=True).click()
    page.get_by_role('button', name='每日任务', exact=True).click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
    page.screenshot(path=str(output / 'level-two-dark.png'), full_page=True)
    for width, height in [(1088, 650), (906, 600), (880, 560)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'Overflow at {width}'
        expect(page.get_by_role('button', name='今日已签到', exact=True)).to_be_visible()
        page.screenshot(path=str(output / f'dark-{width}.png'), full_page=True)
    assert not errors, errors
    report = {'checkInRetryAfterFailure':'passed','dailyDuplicateProtection':'passed','emptyNoteNoReward':'passed',
        'savedWritingReward':'passed','reloadAndBackupRestore':'passed','exactLevelBoundaryToast':'passed',
        'themesAndNarrowViewport':'passed','consoleErrors':errors,'realTauriIPC':True,'dataDir':str(root)}
    (output / 'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    browser.close()
