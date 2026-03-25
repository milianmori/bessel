#!/usr/bin/env python3
"""Swap two bank payloads inside a Midi Fighter Twister .mfs file.

The Midi Fighter Utility exports Twister settings as a compact binary format.
For the Twister, encoder records are stored in sysex-tag order 1..64:

- Bank 1: records 1..16
- Bank 2: records 17..32
- Bank 3: records 33..48
- Bank 4: records 49..64

This tool preserves each record's original tag/version bytes and swaps only the
payloads, which is safer than blindly swapping raw byte ranges.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


TOTAL_RECORDS = 64
RECORDS_PER_BANK = 16
HEADER_PREFIX = 0x00
HEADER_VERSION = 0x01
FIRST_RECORD_TAG = 1
HEADER_SEARCH_MIN = 28
HEADER_SEARCH_MAX = 48


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Swap two Midi Fighter Twister banks in an exported .mfs file."
    )
    parser.add_argument("input", type=Path, help="Path to the source .mfs file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Path for the patched .mfs file. Defaults to a sibling copy.",
    )
    parser.add_argument(
        "--bank-a",
        type=int,
        default=1,
        choices=range(1, 5),
        help="First bank to swap (1-4). Default: 1",
    )
    parser.add_argument(
        "--bank-b",
        type=int,
        default=2,
        choices=range(1, 5),
        help="Second bank to swap (1-4). Default: 2",
    )
    return parser.parse_args()


def header_for(tag: int) -> bytes:
    return bytes((HEADER_PREFIX, tag, HEADER_VERSION, HEADER_PREFIX))


def find_record_starts(data: bytes) -> list[int]:
    first = data.find(header_for(FIRST_RECORD_TAG))
    if first < 0:
        raise ValueError("Could not find the first Twister encoder record in the .mfs file.")

    starts = [first]
    for tag in range(2, TOTAL_RECORDS + 1):
        previous = starts[-1]
        found = -1
        for delta in range(HEADER_SEARCH_MIN, HEADER_SEARCH_MAX + 1):
            idx = previous + delta
            if data[idx : idx + 4] == header_for(tag):
                found = idx
                break
        if found < 0:
            raise ValueError(
                f"Could not locate encoder record {tag}. "
                "The file does not match the expected Twister export layout."
            )
        starts.append(found)

    return starts


def split_records(data: bytes) -> tuple[bytes, list[bytes]]:
    starts = find_record_starts(data)
    prefix = data[: starts[0]]
    records = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(data)
        records.append(data[start:end])

    if len(records) != TOTAL_RECORDS:
        raise ValueError(f"Expected {TOTAL_RECORDS} records, found {len(records)}.")

    for tag, record in enumerate(records, start=1):
        if record[:4] != header_for(tag):
            raise ValueError(f"Record {tag} has an unexpected header.")
        if len(record) < 4:
            raise ValueError(f"Record {tag} is too short.")

    return prefix, records


def swap_bank_payloads(records: list[bytes], bank_a: int, bank_b: int) -> list[bytes]:
    if bank_a == bank_b:
        return records[:]

    swapped = records[:]
    start_a = (bank_a - 1) * RECORDS_PER_BANK
    start_b = (bank_b - 1) * RECORDS_PER_BANK

    for offset in range(RECORDS_PER_BANK):
        idx_a = start_a + offset
        idx_b = start_b + offset
        record_a = records[idx_a]
        record_b = records[idx_b]
        swapped[idx_a] = record_a[:3] + record_b[3:]
        swapped[idx_b] = record_b[:3] + record_a[3:]

    return swapped


def default_output_path(source: Path, bank_a: int, bank_b: int) -> Path:
    return source.with_name(
        f"{source.stem}-bank{bank_a}-bank{bank_b}-swapped{source.suffix}"
    )


def main() -> int:
    args = parse_args()
    if args.bank_a == args.bank_b:
        print("Input and output banks are identical; nothing to do.", file=sys.stderr)
        return 1

    source = args.input.expanduser().resolve()
    output = (args.output or default_output_path(source, args.bank_a, args.bank_b)).expanduser()

    data = source.read_bytes()
    prefix, records = split_records(data)
    swapped = swap_bank_payloads(records, args.bank_a, args.bank_b)
    output.write_bytes(prefix + b"".join(swapped))

    print(f"Wrote {output}")
    print(f"Swapped bank {args.bank_a} with bank {args.bank_b}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
