#!/usr/bin/env python3
"""
週次レポートスクリプト
シーズン・週ごとの詳細統計を計算する

Usage:
    python scripts/weekly_report.py [--config-dir config] [--data-dir data]
"""

import argparse
import csv
import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime
from typing import Dict, Set, List

script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from config_loader import ConfigLoader
from player_registry import PlayerRegistry
from csv_formatter import PokerNowParser, extract_player_id_map
from hand_analysis import StatsCalculator


def get_weekly_data(data_dir: Path, config: ConfigLoader, registry: PlayerRegistry) -> dict:
    """
    週（日付）ごとのデータを収集

    Returns:
        dict: {
            date_str: {
                'season_id': int,
                'table_count': int,
                'players': set(player_ids),
                'player_hands': dict(player_id -> hand_count)
            }
        }
    """
    weekly_data = {}
    hand_histories_dir = data_dir / "hand_histories"

    if not hand_histories_dir.exists():
        return weekly_data

    for date_dir in sorted(hand_histories_dir.iterdir()):
        if not date_dir.is_dir():
            continue

        date_str = date_dir.name
        if not date_str.isdigit() or len(date_str) != 8:
            continue

        # 日付からシーズンを特定
        date = datetime.strptime(date_str, "%Y%m%d")
        season = config.get_season_by_date(date)
        season_id = season["id"] if season else None

        # テーブル数をカウント
        table_dirs = [d for d in date_dir.iterdir() if d.is_dir() and "table" in d.name.lower()]
        table_count = len(table_dirs)

        players = set()
        player_hands = defaultdict(int)

        for table_dir in table_dirs:
            csv_files = list(table_dir.glob("poker_now_log_*.csv"))
            if not csv_files:
                continue

            try:
                parser = PokerNowParser(str(csv_files[0]))
                formatted_text, _ = parser.parse()
                raw_text = parser.raw_text

                registry.process_id_changes(raw_text)
                player_id_map = extract_player_id_map(raw_text)

                histories = [h for h in formatted_text.split("\n\n") if h.strip()]
                if not histories:
                    continue

                calculator = StatsCalculator(histories)
                played_players = calculator.get_all_players()

                for player_name in played_players:
                    raw_id = player_id_map.get(player_name, player_name)
                    registry.register_player(raw_id, player_name)
                    canonical_id = registry.get_canonical_id(raw_id)
                    players.add(canonical_id)

                    # ハンド数を計算
                    stats = calculator.calculate_all(player_name)
                    player_hands[canonical_id] += stats.hands

            except Exception as e:
                print(f"Warning: Failed to parse {table_dir}: {e}")
                continue

        weekly_data[date_str] = {
            'season_id': season_id,
            'table_count': table_count,
            'players': players,
            'player_hands': dict(player_hands)
        }

    return weekly_data


def load_season_stats(data_dir: Path, season_id: int) -> List[dict]:
    """シーズン別スタッツCSVを読み込む"""
    stats_path = data_dir / f"season_{season_id}_stats.csv"
    if not stats_path.exists():
        return []

    stats = []
    with open(stats_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            stats.append(row)
    return stats


def calculate_stat_rankings(stats: List[dict], stat_name: str, top_n: int = 10, min_hands: int = 100) -> tuple:
    """
    特定スタッツのランキングと平均を計算

    Returns:
        tuple: (top_players, average)
    """
    # 有効なデータのみ抽出（ハンド数が一定以上）
    valid_stats = []
    for s in stats:
        try:
            hands = int(s.get('ハンド数', 0))
            value = float(s.get(stat_name, 0))
            if hands >= min_hands:  # 最低ハンド数以上
                valid_stats.append({
                    'name': s.get('プレイヤー', ''),
                    'value': value,
                    'hands': hands
                })
        except (ValueError, TypeError):
            continue

    if not valid_stats:
        return [], 0

    # ソート（降順）
    sorted_stats = sorted(valid_stats, key=lambda x: x['value'], reverse=True)
    top_players = sorted_stats[:top_n]

    # 平均計算
    avg = sum(s['value'] for s in valid_stats) / len(valid_stats)

    return top_players, round(avg, 2)


def main():
    parser = argparse.ArgumentParser(
        description="週次レポートを生成"
    )
    parser.add_argument(
        "--data-dir",
        default="data",
        help="データディレクトリのパス (default: data)"
    )
    parser.add_argument(
        "--config-dir",
        default="config",
        help="設定ディレクトリのパス (default: config)"
    )
    args = parser.parse_args()

    base_dir = Path(__file__).parent.parent
    data_dir = base_dir / args.data_dir
    config_dir = base_dir / args.config_dir

    config = ConfigLoader(str(config_dir))
    registry = PlayerRegistry(config)

    print("データを収集中...")
    weekly_data = get_weekly_data(data_dir, config, registry)

    if not weekly_data:
        print("データが見つかりませんでした。")
        return

    # シーズンごとに集計
    seasons_cumulative: Dict[int, Set[str]] = defaultdict(set)  # シーズンごとの累計参加者
    seasons_hands: Dict[int, Dict[str, int]] = defaultdict(lambda: defaultdict(int))  # シーズンごとのハンド数
    all_time_players: Set[str] = set()  # 全期間の参加者

    sorted_dates = sorted(weekly_data.keys())

    # 週次データを事前計算
    weekly_results = []
    for date_str in sorted_dates:
        data = weekly_data[date_str]
        season_id = data['season_id']
        players = data['players']
        player_hands = data['player_hands']

        # 新規参加者を計算
        if season_id:
            previous_cumulative = seasons_cumulative[season_id].copy()
            new_players = players - previous_cumulative
            seasons_cumulative[season_id].update(players)

            # ハンド数を累計
            for pid, hands in player_hands.items():
                seasons_hands[season_id][pid] += hands
        else:
            new_players = players - all_time_players

        all_time_players.update(players)

        # 400ハンド以上のプレイヤー数
        players_400_plus = sum(1 for h in seasons_hands[season_id].values() if h >= 400) if season_id else 0

        weekly_results.append({
            'date_str': date_str,
            'season_id': season_id,
            'table_count': data['table_count'],
            'players': players,
            'new_players': new_players,
            'cumulative': len(seasons_cumulative[season_id]) if season_id else 0,
            'players_400_plus': players_400_plus
        })

    # === 1. 全体サマリー ===
    print("\n" + "=" * 70)
    print("全体サマリー")
    print("=" * 70)
    print(f"総開催回数: {len(weekly_data)} 回")
    print(f"総参加者数（ユニーク）: {len(all_time_players)} 人")
    total_tables = sum(d['table_count'] for d in weekly_data.values())
    print(f"総卓数: {total_tables} 卓")

    # === 2. 週次レポート ===
    print("\n" + "=" * 70)
    print("週次レポート")
    print("=" * 70)

    for result in weekly_results:
        date_str = result['date_str']
        formatted_date = f"{date_str[:4]}/{date_str[4:6]}/{date_str[6:]}"
        season_name = f"シーズン {result['season_id']}" if result['season_id'] else "シーズン外"

        print(f"\n--- {formatted_date} ({season_name}) ---")
        print(f"  卓数: {result['table_count']}")
        print(f"  参加者数: {len(result['players'])} 人")
        print(f"  新規参加者: {len(result['new_players'])} 人")
        if result['season_id']:
            print(f"  シーズン累計参加者: {result['cumulative']} 人")
            print(f"  シーズン400ハンド以上: {result['players_400_plus']} 人")

        # 新規参加者の名前を表示
        if result['new_players']:
            new_names = [registry.get_display_name(pid) or pid for pid in sorted(result['new_players'])]
            print(f"  新規参加者一覧: {', '.join(new_names[:10])}", end="")
            if len(new_names) > 10:
                print(f" 他{len(new_names) - 10}名")
            else:
                print()

    # === 3. 直近2回の参加者分析 ===
    if len(sorted_dates) >= 2:
        print("\n" + "=" * 70)
        print("直近2回の参加者分析")
        print("=" * 70)

        last_two_dates = sorted_dates[-2:]
        date1, date2 = last_two_dates
        formatted_date1 = f"{date1[:4]}/{date1[4:6]}/{date1[6:]}"
        formatted_date2 = f"{date2[:4]}/{date2[4:6]}/{date2[6:]}"

        players_date1 = weekly_data[date1]['players']
        players_date2 = weekly_data[date2]['players']

        both_participated = players_date1 & players_date2
        either_participated = players_date1 | players_date2
        only_date1 = players_date1 - players_date2
        only_date2 = players_date2 - players_date1

        print(f"\n{formatted_date1} 参加者: {len(players_date1)} 人")
        print(f"{formatted_date2} 参加者: {len(players_date2)} 人")
        print(f"\n両方に参加: {len(both_participated)} 人")
        print(f"どちらかに参加（ユニーク）: {len(either_participated)} 人")
        print(f"{formatted_date1} のみ参加: {len(only_date1)} 人")
        print(f"{formatted_date2} のみ参加: {len(only_date2)} 人")

        # リピート率
        if len(players_date1) > 0:
            repeat_rate = len(both_participated) / len(players_date1) * 100
            print(f"\nリピート率（前回→今回）: {repeat_rate:.1f}%")

        # 両方に参加した人の名前を表示
        print(f"\n--- 両方に参加したプレイヤー ({len(both_participated)}人) ---")
        both_names = [registry.get_display_name(pid) or pid for pid in sorted(both_participated)]
        # 10人ずつ表示
        for i in range(0, len(both_names), 10):
            print(f"  {', '.join(both_names[i:i+10])}")

    # === 4. シーズン別スタッツランキング ===
    print("\n" + "=" * 70)
    print("シーズン別スタッツランキング（100ハンド以上対象）")
    print("=" * 70)

    stat_columns = ['VPIP', 'PFR', '3bet', 'CB', 'WTSD', 'W$SD']

    for season_id in sorted(seasons_cumulative.keys()):
        if season_id is None:
            continue

        season = config.get_season_by_id(season_id)
        season_name = season['name'] if season else f"シーズン {season_id}"

        print(f"\n=== {season_name} ===")

        # シーズンスタッツを読み込み
        stats = load_season_stats(data_dir, season_id)
        if not stats:
            print("  スタッツデータがありません")
            continue

        # 400ハンド以上のプレイヤー数（CSVから）
        players_400_plus = sum(1 for s in stats if int(s.get('ハンド数', 0)) >= 400)
        print(f"\n400ハンド以上のプレイヤー: {players_400_plus} 人")

        for stat_name in stat_columns:
            top_players, avg = calculate_stat_rankings(stats, stat_name)

            print(f"\n【{stat_name}】 平均: {avg}%")
            print("  順位  プレイヤー          値      ハンド数")
            print("  " + "-" * 45)

            for i, p in enumerate(top_players, 1):
                name = p['name'][:12].ljust(12)
                print(f"  {i:2d}.   {name}    {p['value']:6.1f}%    {p['hands']:4d}")


if __name__ == "__main__":
    main()
