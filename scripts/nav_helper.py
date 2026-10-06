#!/usr/bin/env python3
import os
import re

LANGUAGES = [
    {"code": "ja", "name": "日本語", "badge": "🇯🇵", "btn_text": "JP", "prefix": ""},
    {"code": "en", "name": "English", "badge": "🇺🇸", "btn_text": "EN", "prefix": "en"},
    {"code": "de", "name": "Deutsch", "badge": "🇩🇪", "btn_text": "DE", "prefix": "de"},
    {"code": "fr", "name": "Français", "badge": "🇫🇷", "btn_text": "FR", "prefix": "fr"},
    {"code": "es", "name": "Español", "badge": "🇪🇸", "btn_text": "ES", "prefix": "es"},
    {"code": "it", "name": "Italiano", "badge": "🇮🇹", "btn_text": "IT", "prefix": "it"},
    {"code": "zh", "name": "简体中文", "badge": "🇨🇳", "btn_text": "ZH", "prefix": "zh"},
    {"code": "ko", "name": "한국어", "badge": "🇰🇷", "btn_text": "KO", "prefix": "ko"},
]

NAV_ITEMS = {
    'ja': {'home': 'ホーム', 'news': 'お知らせ', 'support': 'サポート', 'privacy': 'プライバシー', 'terms': '利用規約', 'dev': '開発'},
    'en': {'home': 'Home', 'news': 'Updates', 'support': 'Support', 'privacy': 'Privacy', 'terms': 'Terms', 'dev': 'Dev'},
    'de': {'home': 'Startseite', 'news': 'Aktuelles', 'support': 'Support', 'privacy': 'Datenschutz', 'terms': 'Nutzungsbedingungen', 'dev': 'Dev'},
    'fr': {'home': 'Accueil', 'news': 'Actualités', 'support': 'Support', 'privacy': 'Confidentialité', 'terms': 'Conditions', 'dev': 'Dev'},
    'es': {'home': 'Inicio', 'news': 'Noticias', 'support': 'Soporte', 'privacy': 'Privacidad', 'terms': 'Términos', 'dev': 'Dev'},
    'it': {'home': 'Home', 'news': 'Novità', 'support': 'Supporto', 'privacy': 'Privacy', 'terms': 'Termini', 'dev': 'Dev'},
    'zh': {'home': '首页', 'news': '动态', 'support': '技术支持', 'privacy': '隐私政策', 'terms': '用户条款', 'dev': '开发'},
    'ko': {'home': '홈', 'news': '공지사항', 'support': '고객지원', 'privacy': '개인정보처리방침', 'terms': '이용약관', 'dev': '개발'},
}

def get_rel_url(from_lang, to_lang, page_path):
    """
    page_path: relative path within the language root
      e.g. 'index.html', 'support/index.html', 'news/pricing-revision.html'
    """
    from_depth = page_path.count('/') + (0 if from_lang == 'ja' else 1)
    root_prefix = "../" * from_depth

    if to_lang == 'ja':
        target_path = root_prefix + page_path
    else:
        target_path = root_prefix + to_lang + "/" + page_path
    
    if from_lang == to_lang:
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
            <span>{curr['btn_text']}</span>
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

def get_nav_links(page_path, lang):
    labels = NAV_ITEMS[lang]
    
    if page_path == 'index.html':
        return [
            (labels['home'], '#', True, 'mm-home'),
            (labels['news'], 'news/index.html', False, None),
            (labels['support'], 'support/index.html', False, None),
            (labels['privacy'], 'privacy-policy/index.html', False, None),
            (labels['terms'], 'terms/index.html', False, None),
            (labels['dev'], '/dev/', False, None),
        ]
    elif page_path == 'news/index.html':
        return [
            (labels['home'], '../index.html', False, None),
            (labels['news'], '#', True, None),
            (labels['support'], '../support/index.html', False, None),
            (labels['privacy'], '../privacy-policy/index.html', False, None),
            (labels['terms'], '../terms/index.html', False, None),
            (labels['dev'], '/dev/', False, None),
        ]
    elif page_path.startswith('news/'):
        return [
            (labels['home'], '../index.html', False, None),
            (labels['news'], 'index.html', True, None),
            (labels['support'], '../support/index.html', False, None),
            (labels['privacy'], '../privacy-policy/index.html', False, None),
            (labels['terms'], '../terms/index.html', False, None),
            (labels['dev'], '/dev/', False, None),
        ]
    elif page_path == 'support/index.html':
        return [
            (labels['home'], '../index.html', False, None),
            (labels['news'], '../news/index.html', False, None),
            (labels['support'], '#', True, None),
            (labels['privacy'], '../privacy-policy/index.html', False, None),
            (labels['terms'], '../terms/index.html', False, None),
            (labels['dev'], '/dev/', False, None),
        ]
    elif page_path == 'privacy-policy/index.html':
        return [
            (labels['home'], '../index.html', False, None),
            (labels['news'], '../news/index.html', False, None),
            (labels['support'], '../support/index.html', False, None),
            (labels['privacy'], '#', True, None),
            (labels['terms'], '../terms/index.html', False, None),
            (labels['dev'], '/dev/', False, None),
        ]
    elif page_path == 'terms/index.html':
        return [
            (labels['home'], '../index.html', False, None),
            (labels['news'], '../news/index.html', False, None),
            (labels['support'], '../support/index.html', False, None),
            (labels['privacy'], '../privacy-policy/index.html', False, None),
            (labels['terms'], '#', True, None),
            (labels['dev'], '/dev/', False, None),
        ]
    else:
        raise ValueError(f"Unknown page path: {page_path}")

def generate_desktop_nav_links(page_path, lang):
    links = get_nav_links(page_path, lang)
    html_lines = []
    for label, href, is_active, _ in links:
        act = ' class="active"' if is_active else ''
        html_lines.append(f'<li><a href="{href}"{act}>{label}</a></li>')
    return "\n        ".join(html_lines)

def generate_mobile_nav_links(page_path, lang):
    links = get_nav_links(page_path, lang)
    html_lines = []
    for label, href, is_active, elem_id in links:
        act = ' class="active"' if is_active else ''
        id_attr = f' id="{elem_id}"' if elem_id else ''
        html_lines.append(f'<a href="{href}"{act}{id_attr}>{label}</a>')
    return "\n      ".join(html_lines)

def update_entire_navbar(html_content, lang, page_path):
    desktop_links = generate_desktop_nav_links(page_path, lang)
    mobile_links = generate_mobile_nav_links(page_path, lang)
    desktop_lang, mobile_lang = generate_lang_dropdown(lang, page_path)
    
    # 1. Update <ul class="nav-links"...> ... </ul>
    def replace_ul(match):
        open_tag = match.group(1)
        return f'{open_tag}\n        {desktop_links}\n        {desktop_lang}\n      </ul>'
    
    html_content = re.sub(
        r'(<ul\s+class="nav-links"[^>]*>).*?</ul>',
        replace_ul,
        html_content,
        flags=re.DOTALL
    )
    
    # 2. Update <nav class="mobile-menu" ...> <div class="mobile-menu-inner"> ... </div> </nav>
    def replace_mobile(match):
        open_tag = match.group(1)
        return (f'{open_tag}\n'
                f'      {mobile_links}\n'
                f'      <div class="mobile-menu-divider"></div>\n'
                f'      {mobile_lang}\n'
                f'    </div>')
                
    html_content = re.sub(
        r'(<div\s+class="mobile-menu-inner"[^>]*>).*?</div>\s*</nav>',
        lambda m: f'{replace_mobile(m)}\n  </nav>',
        html_content,
        flags=re.DOTALL
    )
    
    # 3. Ensure lang-dropdown.js is included before </body>
    from_depth = page_path.count('/') + (0 if lang == 'ja' else 1)
    root_prefix = "../" * from_depth
    js_tag = f'<script src="{root_prefix}js/lang-dropdown.js"></script>'
    if 'js/lang-dropdown.js' not in html_content:
        html_content = html_content.replace('</body>', f'  {js_tag}\n</body>')

    return html_content
