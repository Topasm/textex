#!/usr/bin/env python3
"""Minimal stand-in for Zotero's local API + Better BibTeX JSON-RPC, for README captures only.

Serves a handful of fake library items on http://127.0.0.1:23119 so the References
panel renders a populated Zotero library without a real Zotero install.
Never use this against real data; it stores nothing.
"""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

ITEMS = [
    ('ABCD2345', 'vaswani2017attention', 'Attention Is All You Need',
     [('Ashish', 'Vaswani'), ('Noam', 'Shazeer'), ('Niki', 'Parmar')], '2017',
     'Advances in Neural Information Processing Systems', '10.5555/3295222.3295349'),
    ('EFGH5678', 'lamport1994latex', 'LaTeX: A Document Preparation System',
     [('Leslie', 'Lamport')], '1994', 'Addison-Wesley', ''),
    ('JKMN9234', 'knuth1984texbook', 'The TeXbook', [('Donald E.', 'Knuth')], '1984',
     'Addison-Wesley', ''),
    ('PQRS3456', 'devlin2019bert', 'BERT: Pre-training of Deep Bidirectional Transformers',
     [('Jacob', 'Devlin'), ('Ming-Wei', 'Chang')], '2019', 'Proceedings of NAACL-HLT',
     '10.18653/v1/N19-1423'),
    ('TUVW7892', 'kingma2015adam', 'Adam: A Method for Stochastic Optimization',
     [('Diederik P.', 'Kingma'), ('Jimmy', 'Ba')], '2015',
     'International Conference on Learning Representations', ''),
]
COLLECTIONS = [('CXYZ2345', 'Thesis reading'), ('DXYZ6789', 'Methods')]


def creators(pairs):
    return [{'creatorType': 'author', 'firstName': f, 'lastName': l} for f, l in pairs]


def local_item(key, citekey, title, authors, date, venue, doi):
    return {'key': key, 'version': 1, 'data': {
        'key': key, 'itemType': 'journalArticle' if doi else 'book', 'title': title,
        'creators': creators(authors), 'date': date, 'DOI': doi, 'archiveLocation': '',
        'abstractNote': f'{title} — abstract placeholder for the README capture.',
        'publicationTitle': venue, 'url': '', 'tags': [], 'collections': [COLLECTIONS[0][0]]}}


def rpc_item(key, citekey, title, authors, date, venue, doi):
    return {'citekey': citekey, 'title': title, 'creators': creators(authors), 'date': date,
            'itemType': 'journalArticle' if doi else 'book'}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet
        sys.stderr.write('%s %s\n' % (self.command, self.path))

    def send_json(self, payload, extra=None):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path.startswith('/better-bibtex/cayw'):
            body = b'ready'
            self.send_response(200); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        if url.path == '/api/users/0/collections':
            self.send_json([{'key': k, 'version': 1, 'data': {'name': n, 'parentCollection': False}} for k, n in COLLECTIONS],
                           {'Total-Results': str(len(COLLECTIONS)), 'Last-Modified-Version': '1'})
            return
        if url.path.endswith('/items/top') or url.path.endswith('/items'):
            q = parse_qs(url.query)
            start = int(q.get('start', ['0'])[0]); limit = int(q.get('limit', ['25'])[0])
            items = [local_item(*i) for i in ITEMS]
            self.send_json(items[start:start + limit], {'Total-Results': str(len(items)), 'Last-Modified-Version': '1'})
            return
        self.send_json([], {'Total-Results': '0', 'Last-Modified-Version': '1'})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        request = json.loads(self.rfile.read(length) or b'{}')
        method = request.get('method', '')
        params = request.get('params', [])
        if method == 'item.citationkey':
            keys = params.get('item_keys', []) if isinstance(params, dict) else []
            lookup = {i[0]: i[1] for i in ITEMS}
            self.send_json({'jsonrpc': '2.0', 'result': {k: lookup.get(k) for k in keys}})
        elif method == 'item.search':
            term = (params[0] if isinstance(params, list) and params else '') or ''
            term = str(term).lower()
            hits = [rpc_item(*i) for i in ITEMS if not term or term in i[2].lower() or term in i[1].lower()]
            self.send_json({'jsonrpc': '2.0', 'result': hits})
        elif method == 'item.export':
            self.send_json({'jsonrpc': '2.0', 'result': '% exported from fake Zotero\n'})
        else:
            self.send_json({'jsonrpc': '2.0', 'result': []})


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', 23119), Handler).serve_forever()
