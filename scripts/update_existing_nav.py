#!/usr/bin/env python3
import os
import glob
import sys
from nav_helper import update_entire_navbar

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
    if '--force-legacy-overwrite' not in sys.argv:
        sys.stderr.write(
            "[ABORTED] Navigation bars and footers across all 8 languages now include /dev/ and /teams/ links.\n"
            "Running this legacy navbar updater would strip newer navigation items.\n"
            "Pass --force-legacy-overwrite only if you intentionally want to run the legacy updater.\n"
        )
        sys.exit(1)
    # Update ja pages
    for p in PAGES:
        fpath = os.path.join(REPO_ROOT, p)
        if os.path.exists(fpath):
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = update_entire_navbar(content, 'ja', p)
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated ja: {p}")

    # Update en pages
    for p in PAGES:
        fpath = os.path.join(REPO_ROOT, 'en', p)
        if os.path.exists(fpath):
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = update_entire_navbar(content, 'en', p)
            with open(fpath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated en: {p}")

if __name__ == '__main__':
    main()
