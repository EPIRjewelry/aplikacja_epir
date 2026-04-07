#!/usr/bin/env python3
"""
Simple script to POST markdown files as documents to the RAG worker admin upsert endpoint.

Usage:
  python tools/upsert_to_vectorize.py --worker https://your-worker.example.workers.dev --admin-token SECRET file1.md file2.md

The worker will generate embeddings using its `env.AI` binding and upsert to `env.VECTOR_INDEX`.
Do NOT pass real secrets in code - use environment variables or CI secrets.
"""

import argparse
import glob
import json
import os
import sys
from urllib import request, error


def read_file(path: str) -> str:
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    parser = argparse.ArgumentParser(description='Upsert markdown files to RAG worker Vectorize index')
    parser.add_argument('--worker', '-w', required=True, help='Base URL of deployed RAG worker (no trailing slash)')
    parser.add_argument('--admin-token', '-t', required=True, help='Admin token for X-ADMIN-TOKEN header')
    parser.add_argument('--glob', '-g', nargs='*', help='Glob(s) to expand for files, e.g. "docs/**/*.md"', default=[])
    parser.add_argument('files', nargs='*', help='Explicit file paths')
    args = parser.parse_args()

    files = list(args.files or [])
    for pat in args.glob:
        files.extend(glob.glob(pat, recursive=True))

    if not files:
        print('No files specified (use positional files or --glob).')
        sys.exit(1)

    docs = []
    cwd = os.getcwd()
    for path in files:
        if not os.path.isfile(path):
            print(f'Warning: {path} not found, skipping')
            continue
        text = read_file(path)
        rel = os.path.relpath(path, cwd).replace('\\', '/')
        docs.append({'id': rel, 'text': text, 'metadata': {'path': rel}})

    payload = json.dumps({'docs': docs}).encode('utf-8')

    url = args.worker.rstrip('/') + '/admin/upsert'
    headers = {
        'Content-Type': 'application/json',
        'X-ADMIN-TOKEN': args.admin_token,
    }

    req = request.Request(url, data=payload, headers=headers, method='POST')
    try:
        with request.urlopen(req) as resp:
            body = resp.read().decode('utf-8')
            print('Success:', resp.status)
            print(body)
    except error.HTTPError as e:
        print('HTTP Error:', e.code)
        try:
            print(e.read().decode('utf-8'))
        except Exception:
            pass
    except Exception as e:
        print('Error:', e)


if __name__ == '__main__':
    main()
