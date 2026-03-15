from playwright.sync_api import sync_playwright
import json

URL = 'https://epirbizuteria.pl'

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        resources = []

        def on_response(response):
            try:
                url = response.url
                if 'assistant.js' in url or 'assistant-runtime.js' in url or 'epir-assistant' in url:
                    resources.append(url)
            except Exception:
                pass

        page.on('response', on_response)
        page.goto(URL, wait_until='networkidle', timeout=60000)
        has_section = page.locator('#epir-assistant-embed').count() > 0
        # also check for launcher by id
        has_launcher = page.locator('#assistant-launcher-embed').count() > 0
        result = {
            'url': URL,
            'has_section': has_section,
            'has_launcher': has_launcher,
            'found_resources': resources,
        }
        print(json.dumps(result, indent=2, ensure_ascii=False))
        browser.close()

if __name__ == '__main__':
    run()
