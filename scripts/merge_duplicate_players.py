#!/usr/bin/env python3
"""
重複プレイヤー統合スクリプト
同じ display_name を持つプレイヤーを統合し、aliases をマージする

Usage:
    python scripts/merge_duplicate_players.py [--config-dir config] [--dry-run]
"""

import argparse
import json
import sys
from pathlib import Path


def merge_duplicates(players_path: Path, dry_run: bool = False) -> tuple:
    """
    同じ display_name を持つプレイヤーを統合

    Returns:
        tuple: (統合前の件数, 統合後の件数, 新しいデータ, 変更差分リスト)
    """
    with open(players_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    original_count = len(data['players'])
    original_players = data['players']

    # display_name でグループ化
    name_groups = {}
    for player_id, info in data['players'].items():
        name = info['display_name']
        if name not in name_groups:
            name_groups[name] = {
                'ids': [],
                'all_aliases': set()
            }
        name_groups[name]['ids'].append(player_id)
        for alias in info.get('aliases', [player_id]):
            name_groups[name]['all_aliases'].add(alias)

    # 新しい players dict を作成 & 差分を収集
    new_players = {}
    diffs = []
    for name, group in name_groups.items():
        # 最初のIDをメインIDとして使用
        main_id = group['ids'][0]
        all_aliases = sorted(list(group['all_aliases']))

        new_players[main_id] = {
            'display_name': name,
            'aliases': all_aliases
        }

        # 統合が発生した場合（複数IDが同一名）
        if len(group['ids']) > 1:
            merged_ids = group['ids'][1:]
            old_aliases_list = []
            for pid in group['ids']:
                old_aliases_list.extend(original_players[pid].get('aliases', [pid]))
            old_aliases = sorted(set(old_aliases_list))
            diffs.append({
                'type': 'merged',
                'display_name': name,
                'main_id': main_id,
                'merged_ids': merged_ids,
                'aliases_before': {pid: sorted(original_players[pid].get('aliases', [pid])) for pid in group['ids']},
                'aliases_after': all_aliases,
            })
        else:
            # 統合はないが aliases が変わった場合
            old_aliases = sorted(original_players[main_id].get('aliases', [main_id]))
            if old_aliases != all_aliases:
                diffs.append({
                    'type': 'aliases_changed',
                    'display_name': name,
                    'main_id': main_id,
                    'aliases_before': old_aliases,
                    'aliases_after': all_aliases,
                })

    new_count = len(new_players)

    # 結果を作成
    new_data = {
        'players': new_players,
        'id_changes': data.get('id_changes', [])
    }

    if not dry_run:
        with open(players_path, 'w', encoding='utf-8') as f:
            json.dump(new_data, f, ensure_ascii=False, indent=2)

    return original_count, new_count, new_data, diffs


def print_diffs(diffs: list) -> None:
    """変更差分を出力"""
    if not diffs:
        print("\n変更なし")
        return

    merged = [d for d in diffs if d['type'] == 'merged']
    alias_changed = [d for d in diffs if d['type'] == 'aliases_changed']

    if merged:
        print(f"\n=== 統合されたプレイヤー ({len(merged)} 件) ===")
        for d in merged:
            print(f"\n  [{d['display_name']}]")
            print(f"    メインID: {d['main_id']}")
            print(f"    統合されたID: {', '.join(d['merged_ids'])}")
            print(f"    統合前:")
            for pid, aliases in d['aliases_before'].items():
                print(f"      {pid}: {aliases}")
            print(f"    統合後 aliases: {d['aliases_after']}")

    if alias_changed:
        print(f"\n=== aliases が変更されたプレイヤー ({len(alias_changed)} 件) ===")
        for d in alias_changed:
            print(f"\n  [{d['display_name']}] ({d['main_id']})")
            print(f"    before: {d['aliases_before']}")
            print(f"    after:  {d['aliases_after']}")


def main():
    parser = argparse.ArgumentParser(
        description="同じ display_name を持つプレイヤーを統合"
    )
    parser.add_argument(
        "--config-dir",
        default="config",
        help="設定ディレクトリのパス (default: config)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="実際にファイルを書き込まない"
    )
    args = parser.parse_args()

    base_dir = Path(__file__).parent.parent
    players_path = base_dir / args.config_dir / "players.json"

    if not players_path.exists():
        print(f"Error: {players_path} not found")
        sys.exit(1)

    original_count, new_count, new_data, diffs = merge_duplicates(players_path, args.dry_run)
    merged_count = original_count - new_count

    print(f"統合前: {original_count} プレイヤー")
    print(f"統合後: {new_count} プレイヤー")
    print(f"削減: {merged_count} 件の重複を統合")

    print_diffs(diffs)

    if args.dry_run:
        print("\n[DRY RUN] ファイルは更新されていません")
    else:
        print(f"\n{players_path} を更新しました")


if __name__ == "__main__":
    main()
