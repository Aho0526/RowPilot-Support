#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build all multilingual pages from English base templates.
Languages to build: de, fr, es, it, zh, ko
"""

import os
import re
from nav_helper import update_html_lang_switcher, LANGUAGES
from translations_home import HOME_TRANSLATIONS
from translations_home_sections import HOME_SECTIONS_TRANSLATIONS
from translations_pages import PAGE_TITLES, SUPPORT_CONTENT

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EN_DIR = os.path.join(REPO_ROOT, 'en')

NEW_LANGS = ['de', 'fr', 'es', 'it', 'zh', 'ko']

NAV_LABELS = {
    'ja': {'home': 'ホーム', 'feat': '機能', 'plans': 'プラン', 'news': 'お知らせ', 'support': 'サポート', 'privacy': 'プライバシー', 'terms': '利用規約'},
    'en': {'home': 'Home', 'feat': 'Features', 'plans': 'Plans', 'news': 'News', 'support': 'Support', 'privacy': 'Privacy', 'terms': 'Terms'},
    'de': {'home': 'Startseite', 'feat': 'Funktionen', 'plans': 'Pläne', 'news': 'Aktuelles', 'support': 'Support', 'privacy': 'Datenschutz', 'terms': 'Nutzungsbedingungen'},
    'fr': {'home': 'Accueil', 'feat': 'Fonctionnalités', 'plans': 'Tarifs', 'news': 'Actualités', 'support': 'Support', 'privacy': 'Confidentialité', 'terms': 'Conditions'},
    'es': {'home': 'Inicio', 'feat': 'Funciones', 'plans': 'Planes', 'news': 'Noticias', 'support': 'Soporte', 'privacy': 'Privacidad', 'terms': 'Términos'},
    'it': {'home': 'Home', 'feat': 'Funzioni', 'plans': 'Piani', 'news': 'Novità', 'support': 'Supporto', 'privacy': 'Privacy', 'terms': 'Termini'},
    'zh': {'home': '首页', 'feat': '功能', 'plans': '方案', 'news': '动态', 'support': '技术支持', 'privacy': '隐私政策', 'terms': '用户条款'},
    'ko': {'home': '홈', 'feat': '기능', 'plans': '요금제', 'news': '공지사항', 'support': '고객지원', 'privacy': '개인정보처리방침', 'terms': '이용약관'},
}

def update_nav_links(html, lang, is_top=True):
    nl = NAV_LABELS[lang]
    # Replace navigation text
    replacements = [
        (r'>Home<', f'>{nl["home"]}<'),
        (r'>Features<', f'>{nl["feat"]}<'),
        (r'>Plans<', f'>{nl["plans"]}<'),
        (r'>News<', f'>{nl["news"]}<'),
        (r'>Support<', f'>{nl["support"]}<'),
        (r'>Privacy Policy<', f'>{nl["privacy"]}<'),
        (r'>Privacy<', f'>{nl["privacy"]}<'),
        (r'>Terms of Use<', f'>{nl["terms"]}<'),
        (r'>Terms<', f'>{nl["terms"]}<'),
    ]
    for pattern, repl in replacements:
        html = re.sub(pattern, repl, html)
    return html

def build_index_page(lang):
    en_path = os.path.join(EN_DIR, 'index.html')
    with open(en_path, 'r', encoding='utf-8') as f:
        html = f.read()

    ht = HOME_TRANSLATIONS[lang]
    hs = HOME_SECTIONS_TRANSLATIONS[lang]

    # Update html lang attribute
    html = re.sub(r'<html\s+lang="[^"]*"', f'<html lang="{ht["lang_code"]}"', html)
    # Title
    html = re.sub(r'<title>.*?</title>', f'<title>{ht["page_title"]}</title>', html)
    # Meta description
    html = re.sub(r'<meta name="description" content="[^"]*"', f'<meta name="description" content="{ht["meta_desc"]}"', html)

    # Hero
    html = html.replace('iOS App Built by an Active Rower', ht['hero_eyebrow'])
    html = re.sub(r'<h1>.*?</h1>', f'<h1>{ht["hero_h1"]}</h1>', html, flags=re.DOTALL)
    html = re.sub(r'<p class="hero-sub">.*?</p>', f'<p class="hero-sub">{ht["hero_sub"]}</p>', html, flags=re.DOTALL)
    html = html.replace('View Features', ht['hero_cta_feat'])
    html = html.replace('Developer Story', ht['hero_cta_story'])

    # Section headers
    html = html.replace('<span class="sec-label">Features</span>', f'<span class="sec-label">{ht["feat_label"]}</span>')
    html = html.replace('<h2>What RowPilot Can Do</h2>', f'<h2>{ht["feat_title"]}</h2>')
    html = html.replace('<p>Covering all features needed for both on-water and ergometer training. Elevate both rowers and managers with a single app.</p>', f'<p>{ht["feat_sub"]}</p>')

    # 4 Cards
    html = html.replace('GPS &amp; Stroke Rate', ht['card1_title'])
    html = html.replace('Accurately measure stroke rate (SPM), split time (/500m), speed, and distance in real time using iPhone and Apple Watch.', ht['card1_desc'])
    
    html = html.replace('Concept2 PM5 Link', ht['card2_title'])
    html = html.replace('Direct Bluetooth connection to the PM5. Live-receive watts, force curve, stroke rate, and heart rate data per second.', ht['card2_desc'])
    
    html = html.replace('Tide Forecasts &amp; Weather', ht['card3_title'])
    html = html.replace('Automatically displays tide graphs and retrieve wind conditions at 239 ports across Japan using GPS location.', ht['card3_desc'])
    
    html = html.replace('Multi-Erg Synchronization', ht['card4_title'])
    html = html.replace('Wirelessly connect multiple PM5 monitors simultaneously. Managers can monitor team members\' real-time numbers from one device.', ht['card4_desc'])

    # Plans section header
    html = html.replace('<span class="sec-label">Plans</span>', f'<span class="sec-label">{ht["plans_label"]}</span>')
    html = html.replace('<h2>Plans tailored for rowers and teams</h2>', f'<h2>{ht["plans_title"]}</h2>')
    html = html.replace('<p>From individual athletes to small clubs and large organizations, flexible plans are ready for every stage.</p>', f'<p>{ht["plans_sub"]}</p>')

    # Plans note & buttons
    html = html.replace('* Purchases can only be made via in-app subscriptions (App Store). Direct sales are not available on this website.', hs['plans_note'])
    html = html.replace('View Plan Details', hs['plan_btn_detail'])

    # Story section header
    html = html.replace('<span class="sec-label">Story</span>', f'<span class="sec-label">{ht["story_label"]}</span>')
    html = html.replace('<h2>The Story Behind RowPilot</h2>', f'<h2>{ht["story_title"]}</h2>')

    # Footer
    html = re.sub(r'<p class="footer-copy">.*?</p>', f'<p class="footer-copy">{ht["footer_copy"]}</p>', html, flags=re.DOTALL)

    # Nav
    html = update_nav_links(html, lang, is_top=True)

    # Multi-language selector
    html = update_html_lang_switcher(html, lang, 'index.html')

    out_dir = os.path.join(REPO_ROOT, lang)
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, 'index.html')
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Generated {lang}/index.html")

def build_support_page(lang):
    en_path = os.path.join(EN_DIR, 'support', 'index.html')
    with open(en_path, 'r', encoding='utf-8') as f:
        html = f.read()

    title, desc = PAGE_TITLES['support'][lang]
    sc = SUPPORT_CONTENT[lang]

    html = re.sub(r'<html\s+lang="[^"]*"', f'<html lang="{lang}"', html)
    html = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', html)
    html = re.sub(r'<meta name="description" content="[^"]*"', f'<meta name="description" content="{desc}"', html)

    html = html.replace('<h1>Support Desk</h1>', f'<h1>{sc["heading"]}</h1>')
    html = re.sub(r'<p>Feel free to reach out for bug reports,.*?</p>', f'<p>{sc["sub"]}</p>', html, flags=re.DOTALL)
    html = re.sub(r'<p class="contact-note">.*?</p>', f'<p class="contact-note">{sc["note"]}</p>', html, flags=re.DOTALL)
    html = html.replace('<h2>Frequently Asked Questions</h2>', f'<h2>{sc["faq_title"]}</h2>')
    html = html.replace('<p>Please check here first if you encounter any issues.</p>', f'<p>{sc["faq_sub"]}</p>')

    html = html.replace('Bluetooth &amp; Connection', sc['cat_conn'])
    html = html.replace('Data &amp; Backup', sc['cat_data'])

    html = update_nav_links(html, lang, is_top=False)
    html = update_html_lang_switcher(html, lang, 'support/index.html')

    out_dir = os.path.join(REPO_ROOT, lang, 'support')
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, 'index.html')
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Generated {lang}/support/index.html")

def build_terms_page(lang):
    en_path = os.path.join(EN_DIR, 'terms', 'index.html')
    with open(en_path, 'r', encoding='utf-8') as f:
        html = f.read()

    title, desc = PAGE_TITLES['terms'][lang]
    html = re.sub(r'<html\s+lang="[^"]*"', f'<html lang="{lang}"', html)
    html = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', html)
    html = re.sub(r'<meta name="description" content="[^"]*"', f'<meta name="description" content="{desc}"', html)

    html = update_nav_links(html, lang, is_top=False)
    html = update_html_lang_switcher(html, lang, 'terms/index.html')

    out_dir = os.path.join(REPO_ROOT, lang, 'terms')
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, 'index.html')
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Generated {lang}/terms/index.html")

def build_privacy_page(lang):
    en_path = os.path.join(EN_DIR, 'privacy-policy', 'index.html')
    with open(en_path, 'r', encoding='utf-8') as f:
        html = f.read()

    title, desc = PAGE_TITLES['privacy'][lang]
    html = re.sub(r'<html\s+lang="[^"]*"', f'<html lang="{lang}"', html)
    html = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', html)
    html = re.sub(r'<meta name="description" content="[^"]*"', f'<meta name="description" content="{desc}"', html)

    html = update_nav_links(html, lang, is_top=False)
    html = update_html_lang_switcher(html, lang, 'privacy-policy/index.html')

    out_dir = os.path.join(REPO_ROOT, lang, 'privacy-policy')
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, 'index.html')
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Generated {lang}/privacy-policy/index.html")

def build_news_pages(lang):
    title, desc = PAGE_TITLES['news'][lang]
    out_dir = os.path.join(REPO_ROOT, lang, 'news')
    os.makedirs(out_dir, exist_ok=True)

    # news/index.html
    en_path = os.path.join(EN_DIR, 'news', 'index.html')
    with open(en_path, 'r', encoding='utf-8') as f:
        html = f.read()
    html = re.sub(r'<html\s+lang="[^"]*"', f'<html lang="{lang}"', html)
    html = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', html)
    html = re.sub(r'<meta name="description" content="[^"]*"', f'<meta name="description" content="{desc}"', html)
    html = update_nav_links(html, lang, is_top=False)
    html = update_html_lang_switcher(html, lang, 'news/index.html')
    with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Generated {lang}/news/index.html")

    # news/pricing-revision.html
    en_path = os.path.join(EN_DIR, 'news', 'pricing-revision.html')
    with open(en_path, 'r', encoding='utf-8') as f:
        html = f.read()
    html = re.sub(r'<html\s+lang="[^"]*"', f'<html lang="{lang}"', html)
    html = update_nav_links(html, lang, is_top=False)
    html = update_html_lang_switcher(html, lang, 'news/pricing-revision.html')
    with open(os.path.join(out_dir, 'pricing-revision.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Generated {lang}/news/pricing-revision.html")

    # news/team-migration-policy.html
    en_path = os.path.join(EN_DIR, 'news', 'team-migration-policy.html')
    with open(en_path, 'r', encoding='utf-8') as f:
        html = f.read()
    html = re.sub(r'<html\s+lang="[^"]*"', f'<html lang="{lang}"', html)
    html = update_nav_links(html, lang, is_top=False)
    html = update_html_lang_switcher(html, lang, 'news/team-migration-policy.html')
    with open(os.path.join(out_dir, 'team-migration-policy.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Generated {lang}/news/team-migration-policy.html")

def main():
    for lang in NEW_LANGS:
        print(f"--- Building language: {lang} ---")
        build_index_page(lang)
        build_support_page(lang)
        build_terms_page(lang)
        build_privacy_page(lang)
        build_news_pages(lang)
    print("\nAll languages built successfully!")

if __name__ == '__main__':
    main()
