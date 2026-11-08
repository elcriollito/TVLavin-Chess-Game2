#!/usr/bin/env python3
"""Independently validate a Polyglot BIN against PGN with python-chess."""

from __future__ import annotations

import argparse
import collections
import json
import struct
from pathlib import Path

import chess
import chess.pgn
import chess.polyglot

ENTRY = struct.Struct(">QHHI")
PROMOTION = {chess.KNIGHT: 1, chess.BISHOP: 2, chess.ROOK: 3, chess.QUEEN: 4}


def encode_move(board: chess.Board, move: chess.Move) -> int:
    to_square = move.to_square
    if board.is_castling(move):
        if move.from_square == chess.E1 and move.to_square == chess.G1:
            to_square = chess.H1
        elif move.from_square == chess.E1 and move.to_square == chess.C1:
            to_square = chess.A1
        elif move.from_square == chess.E8 and move.to_square == chess.G8:
            to_square = chess.H8
        elif move.from_square == chess.E8 and move.to_square == chess.C8:
            to_square = chess.A8
    return to_square | (move.from_square << 6) | (PROMOTION.get(move.promotion, 0) << 12)


def expected_entries(pgn_path: Path, max_ply: int, min_count: int, side: str):
    counts: collections.Counter[tuple[int, int]] = collections.Counter()
    games = 0
    skipped = 0
    with pgn_path.open("r", encoding="utf-8-sig", errors="replace") as stream:
        while True:
            game = chess.pgn.read_game(stream)
            if game is None:
                break
            games += 1
            if game.errors:
                skipped += 1
                continue
            board = game.board()
            for ply, move in enumerate(game.mainline_moves()):
                if ply >= max_ply:
                    break
                include = side == "both" or (side == "white" and board.turn) or (side == "black" and not board.turn)
                if include:
                    counts[(chess.polyglot.zobrist_hash(board), encode_move(board, move))] += 1
                board.push(move)
    entries = [(key, move, min(count, 65535), 0) for (key, move), count in counts.items() if count >= min_count]
    entries.sort(key=lambda row: (row[0], row[1]))
    return entries, games, skipped


def read_entries(bin_path: Path):
    data = bin_path.read_bytes()
    if len(data) % ENTRY.size:
        raise ValueError(f"BIN size {len(data)} is not divisible by 16")
    return [ENTRY.unpack_from(data, offset) for offset in range(0, len(data), ENTRY.size)]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pgn", type=Path, required=True)
    parser.add_argument("--bin", type=Path, required=True)
    parser.add_argument("--max-ply", type=int, default=160)
    parser.add_argument("--min-count", type=int, default=1)
    parser.add_argument("--side", choices=("both", "white", "black"), default="both")
    args = parser.parse_args()

    expected, games, skipped = expected_entries(args.pgn, args.max_ply, args.min_count, args.side)
    actual = read_entries(args.bin)
    passed = actual == expected
    print(json.dumps({
        "validator": "python-chess",
        "chessVersion": chess.__version__,
        "passed": passed,
        "games": games,
        "skipped": skipped,
        "expectedEntries": len(expected),
        "actualEntries": len(actual),
        "sorted": actual == sorted(actual, key=lambda row: (row[0], row[1])),
        "learnFieldsZero": all(row[3] == 0 for row in actual),
        "firstMismatch": next((index for index, pair in enumerate(zip(actual, expected)) if pair[0] != pair[1]), None)
    }, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
