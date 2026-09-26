#!/usr/bin/env python3
import os
import glob
from nav_helper import update_html_lang_switcher

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = [
    'index.html',
    'support/index.html',
    'privacy-policy/index.html',
    'terms/index.html',
    'news/index.html',
    'news/pricing-revision.html',
    'news/team-migration-policy.html'
]

def main():
    # Update ja pages
    for p in PAGES:
        fpath = os.path.join(REPO_ROOT, p)
        if os.path.exists(fpath):
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = update_html_lang_switcher(content, 'ja', p)
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated ja: {p}")

    # Update en pages
    for p in PAGES:
        fpath = os.path.join(REPO_ROOT, 'en', p)
        if os.path.exists(fpath):
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = update_html_lang_switcher(content, 'en', p)
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated en: {p}")

if __name__ == '__main__':
    main()
