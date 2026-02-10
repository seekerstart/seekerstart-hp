#!/usr/bin/env python3
"""
重複プレイヤー検出スクリプト
同じ display_name を持つプレイヤーを検出して表示する

Usage:
    python scripts/find_duplicate_players.py [--config-dir config]
"""

import argparse
import json
import sys
from pathlib import Path


def find_duplicates(players_path: Path) -> dict:
    """
    同じ display_name を持つプレイヤーを検出

    Returns:
        dict: {display_name: [entries]} 重複しているもののみ
    """
    with open(players_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # display_name でグループ化
    name_groups = {}
    for player_id, info in data['players'].items():
        name = info['display_name']
        if name not in name_groups:
            name_groups[name] = []
        name_groups[name].append({
            'id': player_id,
            'aliases': info.get('aliases', [player_id])
        })

    # 重複のみを抽出
    duplicates = {name: entries for name, entries in name_groups.items() if len(entries) > 1}
    return duplicates


def main():
    parser = argparse.ArgumentParser(
        description="同じ display_name を持つプレイヤーを検出"
    )
    parser.add_argument(
        "--config-dir",
        default="config",
        help="設定ディレクトリのパス (default: config)"
    )
    args = parser.parse_args()

    base_dir = Path(__file__).parent.parent
    players_path = base_dir / args.config_dir / "players.json"

    if not players_path.exists():
        print(f"Error: {players_path} not found")
        sys.exit(1)

    duplicates = find_duplicates(players_path)

    if not duplicates:
        print("重複している display_name はありません。")
        return

    print(f"=== 重複している display_name ({len(duplicates)}件) ===")
    for name, entries in duplicates.items():
        print(f"\n{name}:")
        for entry in entries:
            print(f"  ID: {entry['id']}")
            print(f"  Aliases: {entry['aliases']}")

    print(f"\n合計: {len(duplicates)} 件の display_name が重複しています")


if __name__ == "__main__":
    main()
