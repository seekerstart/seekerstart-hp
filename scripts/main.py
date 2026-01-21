#!/usr/bin/env python3
"""
ポーカースタッツシステム - メインエントリーポイント

Usage:
    python scripts/main.py --data-dir data --config-dir config [--verbose] [--dry-run]
"""

import argparse
import sys
from pathlib import Path

# スクリプトディレクトリをパスに追加
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from config_loader import ConfigLoader
from player_registry import PlayerRegistry
from stats_aggregator import StatsAggregator


def main():
    parser = argparse.ArgumentParser(
        description="Poker Now ハンド履歴からスタッツを計算しCSVを生成"
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
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="詳細な出力を表示"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="実際にファイルを書き込まない"
    )

    args = parser.parse_args()

    # パスを解決
    base_dir = Path(__file__).parent.parent
    data_dir = base_dir / args.data_dir
    config_dir = base_dir / args.config_dir

    if args.verbose:
        print(f"Base directory: {base_dir}")
        print(f"Data directory: {data_dir}")
        print(f"Config directory: {config_dir}")

    # 設定ファイルの存在確認
    if not config_dir.exists():
        print(f"Error: Config directory not found: {config_dir}")
        sys.exit(1)

    # 初期化
    try:
        config = ConfigLoader(str(config_dir))
        registry = PlayerRegistry(config)
        aggregator = StatsAggregator(
            config,
            registry,
            data_dir=str(data_dir),
            verbose=args.verbose
        )
    except Exception as e:
        print(f"Error during initialization: {e}")
        sys.exit(1)

    # セッション検出
    sessions = aggregator.discover_sessions()
    if args.verbose:
        print(f"\nFound {len(sessions)} sessions")
        for session in sessions:
            print(f"  - {session.session_dir.name} (Season: {session.season_id})")

    if not sessions:
        print("No sessions found. Please add hand histories to data/hand_histories/")
        print("\nExpected directory structure:")
        print("  data/hand_histories/")
        print("    └── {YYYYMMDD}_table{N}/")
        print("        ├── poker_now_log_*.csv")
        print("        └── ledger_*.csv")
        sys.exit(0)

    # 集計処理
    print("\nProcessing sessions...")
    aggregator.aggregate(sessions)

    # 結果サマリー
    print(f"\n=== Summary ===")
    print(f"Total players: {len(aggregator.all_stats)}")
    print(f"Total unique hands: {aggregator.total_unique_hands}")
    total_player_hands = sum(s.hands for s in aggregator.all_stats.values())
    print(f"Total player-hands: {total_player_hands} (延べ参加数)")
    print(f"Seasons with data: {len(aggregator.stats_by_season)}")

    if args.dry_run:
        print("\n[DRY RUN] Skipping file writes")
    else:
        # CSV出力
        print("\nWriting CSV files...")

        # データディレクトリが存在しない場合は作成
        data_dir.mkdir(parents=True, exist_ok=True)

        all_stats_path = aggregator.output_all_stats()
        print(f"  - {all_stats_path}")

        season_paths = aggregator.output_season_stats()
        for path in season_paths:
            print(f"  - {path}")

        # プレイヤー登録情報を保存
        registry.save()
        print(f"  - {config.players_path}")

    print("\nDone!")


if __name__ == "__main__":
    main()
