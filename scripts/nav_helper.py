#!/usr/bin/env python3
import os
import re

LANGUAGES = [
    {"code": "ja", "name": "日本語", "badge": "JP", "prefix": ""},
    {"code": "en", "name": "English", "badge": "EN", "prefix": "en"},
    {"code": "de", "name": "Deutsch", "badge": "DE", "prefix": "de"},
    {"code": "fr", "name": "Français", "badge": "FR", "prefix": "fr"},
    {"code": "es", "name": "Español", "badge": "ES", "prefix": "es"},
    {"code": "it", "name": "Italiano", "badge": "IT", "prefix": "it"},
    {"code": "zh", "name": "简体中文", "badge": "ZH", "prefix": "zh"},
    {"code": "ko", "name": "한국어", "badge": "KO", "prefix": "ko"},
]

def get_rel_url(from_lang, to_lang, page_path):
    """
    page_path: relative path within the language root
      e.g. 'index.html', 'support/index.html', 'news/pricing-revision.html'
    """
    # Calculate depth of from_file relative to repo root
    # ja: page_path depth
    # other langs: 1 + page_path depth
    from_depth = page_path.count('/') + (0 if from_lang == 'ja' else 1)
    root_prefix = "../" * from_depth

    if to_lang == 'ja':
        target_path = root_prefix + page_path
    else:
        target_path = root_prefix + to_lang + "/" + page_path
    
    # Normalize path if staying in same dir
    if from_lang == to_lang:
        # Just filename
        target_path = page_path.split('/')[-1]
        
    return target_path

def generate_lang_dropdown(from_lang, page_path):
    curr = next(l for l in LANGUAGES if l["code"] == from_lang)
    
    desktop_items = []
    mobile_items = []
    
    for l in LANGUAGES:
        url = get_rel_url(from_lang, l["code"], page_path)
        is_active = (l["code"] == from_lang)
        active_cls = " active" if is_active else ""
        desktop_items.append(
            f'<a href="{url}" class="lang-dropdown-item{active_cls}" data-lang="{l["code"]}">'
            f'<span>{l["name"]}</span><span class="lang-code-badge">{l["badge"]}</span></a>'
        )
        mobile_items.append(
            f'<a href="{url}" class="mobile-lang-item{active_cls}" data-lang="{l["code"]}">'
            f'<span>{l["name"]}</span><span class="lang-code-badge">{l["badge"]}</span></a>'
        )

    desktop_html = f'''<li class="lang-dropdown-wrapper">
          <button class="lang-btn" type="button" aria-label="Select Language">
            <span class="lang-globe">🌐</span>
            <span>{curr['badge']}</span>
            <span class="lang-arrow">▾</span>
          </button>
          <div class="lang-dropdown-menu">
            {''.join(desktop_items)}
          </div>
        </li>'''

    mobile_html = f'''<div class="mobile-lang-sec">
        <div class="mobile-lang-title">🌐 Language / 言語</div>
        <div class="mobile-lang-grid">
          {''.join(mobile_items)}
        </div>
      </div>'''

    return desktop_html, mobile_html

def update_html_lang_switcher(html_content, from_lang, page_path):
    desktop_html, mobile_html = generate_lang_dropdown(from_lang, page_path)
    
    # Replace desktop lang-switch: <li><a href="..." class="lang-switch">...</a></li> or existing dropdown
    html_content = re.sub(
        r'<li class="lang-dropdown-wrapper">.*?</li>|<li[^>]*><a\s+[^>]*class="lang-switch"[^>]*>.*?</a></li>',
        desktop_html,
        html_content,
        flags=re.DOTALL
    )
    
    # Replace mobile lang-switch: <a href="..." class="lang-switch-mobile">...</a> or existing mobile-lang-sec
    html_content = re.sub(
        r'<div class="mobile-lang-sec">.*?</div>\s*</div>|<a\s+[^>]*class="lang-switch-mobile"[^>]*>.*?</a>',
        mobile_html,
        html_content,
        flags=re.DOTALL
    )

    # Ensure lang-dropdown.js is included before </body>
    from_depth = page_path.count('/') + (0 if from_lang == 'ja' else 1)
    root_prefix = "../" * from_depth
    js_tag = f'<script src="{root_prefix}js/lang-dropdown.js"></script>'
    if 'js/lang-dropdown.js' not in html_content:
        html_content = html_content.replace('</body>', f'  {js_tag}\n</body>')

    return html_content
