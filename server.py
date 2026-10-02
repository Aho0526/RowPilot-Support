#!/usr/bin/env python3
"""
RowPilot Support — カスタム静的サーバー
- 404 エラー時に /404.html を返す
- ポート: 8000（デフォルト）
"""

import os
import sys
import signal
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def send_error(self, code, message=None, explain=None):
        """404 のみカスタムページを返す。それ以外は標準動作。"""
        if code == 404:
            custom_path = os.path.join(ROOT_DIR, '404.html')
            if os.path.isfile(custom_path):
                self.send_response(404)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                with open(custom_path, 'rb') as f:
                    self.wfile.write(f.read())
                return
        super().send_error(code, message, explain)

    def log_message(self, format, *args):
        status = args[1] if len(args) > 1 else '-'
        color = '\033[91m' if status.startswith(('4', '5')) else '\033[92m'
        reset = '\033[0m'
        print(f"  {color}{self.address_string()} [{self.log_date_time_string()}] {format % args}{reset}")


def main():
    server = HTTPServer(('', PORT), CustomHandler)
    print(f"\033[96m")
    print(f"  RowPilot Dev Server")
    print(f"  ─────────────────────────────────────────")
    print(f"  → http://localhost:{PORT}/")
    print(f"  → http://localhost:{PORT}/dev/          (Dev Portal)")
    print(f"  → http://localhost:{PORT}/dev/game/     (ハコゲーム)")
    print(f"  → http://localhost:{PORT}/dev/statement-of-purpose/")
    print(f"  → http://localhost:{PORT}/dev/document/")
    print(f"  → http://localhost:{PORT}/dev/count/    (文化祭カウント)")
    print(f"  ─────────────────────────────────────────")
    print(f"  Ctrl+C で停止")
    print(f"\033[0m")

    def shutdown(sig, frame):
        print('\n\033[93m  サーバーを停止しました\033[0m\n')
        server.server_close()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    server.serve_forever()


if __name__ == '__main__':
    main()
