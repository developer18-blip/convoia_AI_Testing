#!/usr/bin/env python3
"""CSV Generator for ConvoiaAI. JSON in via stdin, CSV written to argv[1]."""
import sys
import json
import csv


def main():
    if len(sys.argv) < 2:
        print('Usage: generate_csv.py <output_path>', file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]

    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f'Invalid JSON input: {e}', file=sys.stderr)
        sys.exit(2)

    headers = data.get('headers', [])
    rows = data.get('rows', [])

    if not headers:
        print('No headers provided', file=sys.stderr)
        sys.exit(3)

    try:
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(headers)
            for row in rows:
                row = list(row)
                while len(row) < len(headers):
                    row.append('')
                writer.writerow(row[:len(headers)])
        print(json.dumps({'success': True, 'path': output_path}))
    except IOError as e:
        print(f'Failed to write CSV: {e}', file=sys.stderr)
        sys.exit(4)


if __name__ == '__main__':
    main()
