"""Inspect the real Tauri WebView, not a mocked browser implementation."""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=9222)
parser.add_argument('--output', default='test-results')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{args.port}')
    page = browser.contexts[0].pages[0]
    page.wait_for_load_state('networkidle')
    page.screenshot(path=str(output / 'desktop-initial.png'), full_page=True)
    print('URL:', page.url)
    print('BODY:', page.locator('body').inner_text())
    print('BUTTONS:', page.get_by_role('button').all_text_contents())
    browser.close()
