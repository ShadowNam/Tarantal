"""Serve the illustrated playtest report and the production game through tank Preview.

Run after npm run build: python3 tools/serve-review.py --port "$PORT"
The report is deliberately outside dist: its screenshots must not enter the game's PWA cache.
"""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / "docs" / "playtest-2026-11-14"
GAME = ROOT / "dist"


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        route = unquote(urlsplit(path).path)
        root = GAME if route.startswith("/play/") else REPORT
        relative = route[len("/play/"):] if root == GAME else route.lstrip("/")
        target = (root / relative).resolve()
        if not target.is_relative_to(root):
            return str(REPORT / "__not_found__")
        return str(target)

    def do_GET(self):
        if urlsplit(self.path).path == "/play":
            self.send_response(302)
            self.send_header("Location", "play/")
            self.end_headers()
            return
        super().do_GET()

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    if not (GAME / "index.html").is_file():
        parser.error("Build the game first with npm run build")
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()
