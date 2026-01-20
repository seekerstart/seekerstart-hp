"""
スタッツ集計モジュール
セッションごとのスタッツを集計してCSV出力する
"""

import csv
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass

from hand_analysis import PlayerStats, StatsCalculator
from csv_formatter import PokerNowParser, LedgerParser, extract_player_id_map
from config_loader import ConfigLoader
from player_registry import PlayerRegistry


@dataclass
class SessionInfo:
    """セッション情報を保持するデータクラス"""
    date: datetime
    session_dir: Path
    csv_path: Optional[Path] = None
    ledger_path: Optional[Path] = None
    season_id: Optional[int] = None


class StatsAggregator:
    """スタッツを集計するクラス"""

    CSV_HEADERS = [
        "player_id", "プレイヤー", "リーグ", "収支", "ハンド数",
        "VPIP", "PFR", "3bet", "Fold to 3bet", "CB", "WTSD", "W$SD"
    ]

    def __init__(self, config_loader: ConfigLoader, player_registry: PlayerRegistry,
                 data_dir: str = "data", verbose: bool = False):
        self.config = config_loader
        self.registry = player_registry
        self.data_dir = Path(data_dir)
        self.verbose = verbose
        # player_id -> season_id -> PlayerStats
        self.stats_by_season: Dict[int, Dict[str, PlayerStats]] = {}
        # player_id -> PlayerStats (全期間)
        self.all_stats: Dict[str, PlayerStats] = {}

    def discover_sessions(self) -> List[SessionInfo]:
        """data/hand_histories/内のセッションを検出"""
        sessions = []
        hand_histories_dir = self.data_dir / "hand_histories"

        if not hand_histories_dir.exists():
            if self.verbose:
                print(f"Warning: {hand_histories_dir} does not exist")
            return sessions

        for session_dir in sorted(hand_histories_dir.iterdir()):
            if not session_dir.is_dir():
                continue

            # ディレクトリ名から日付を抽出 (例: 20260112_table1)
            dir_name = session_dir.name
            try:
                date_str = dir_name.split("_")[0]
                date = datetime.strptime(date_str, "%Y%m%d")
            except (ValueError, IndexError):
                if self.verbose:
                    print(f"Warning: Cannot parse date from {dir_name}")
                continue

            session = SessionInfo(date=date, session_dir=session_dir)

            # CSVファイルを検索
            csv_files = list(session_dir.glob("poker_now_log_*.csv"))
            if csv_files:
                session.csv_path = csv_files[0]

            ledger_files = list(session_dir.glob("ledger_*.csv"))
            if ledger_files:
                session.ledger_path = ledger_files[0]

            # シーズンを特定
            season = self.config.get_season_by_date(date)
            if season:
                session.season_id = season["id"]

            sessions.append(session)

        return sessions

    def process_session(self, session: SessionInfo) -> Dict[str, PlayerStats]:
        """1セッションを処理してスタッツを計算"""
        if self.verbose:
            print(f"Processing session: {session.session_dir.name}")

        if not session.csv_path or not session.csv_path.exists():
            if self.verbose:
                print(f"  Warning: No CSV file found")
            return {}

        # CSVをパース
        parser = PokerNowParser(str(session.csv_path))
        formatted_text, player_names = parser.parse()

        # ID変更を検出
        with open(session.csv_path, "r", encoding="utf-8") as f:
            raw_text = f.read()
        self.registry.process_id_changes(raw_text)

        # プレイヤーIDマップを取得
        player_id_map = extract_player_id_map(raw_text)

        # ハンド履歴を取得
        histories = [h for h in formatted_text.split("\n\n") if h.strip()]
        if not histories:
            if self.verbose:
                print(f"  Warning: No hands found")
            return {}

        # スタッツ計算
        calculator = StatsCalculator(histories)
        all_players = calculator.get_all_players()

        session_stats = {}
        for player_name in all_players:
            stats = calculator.calculate_all(player_name)
            player_id = player_id_map.get(player_name, player_name)
            stats.player_id = player_id
            stats.display_name = player_name

            # リーグを設定
            if session.season_id:
                season = self.config.get_season_by_id(session.season_id)
                if season:
                    stats.league = self.config.get_player_league(player_id, season)

            # プレイヤーを登録
            self.registry.register_player(player_id, player_name)

            session_stats[player_id] = stats

        # Ledgerから収支を取得
        if session.ledger_path and session.ledger_path.exists():
            ledger_parser = LedgerParser(str(session.ledger_path))
            ledger_data = ledger_parser.parse()

            for player_id, ledger_info in ledger_data.items():
                canonical_id = self.registry.get_canonical_id(player_id)
                if canonical_id in session_stats:
                    session_stats[canonical_id].net = ledger_info["net"]
                elif player_id in session_stats:
                    session_stats[player_id].net = ledger_info["net"]

        if self.verbose:
            print(f"  Found {len(session_stats)} players, {len(histories)} hands")

        return session_stats

    def aggregate(self, sessions: List[SessionInfo]) -> None:
        """全セッションを集計"""
        for session in sessions:
            session_stats = self.process_session(session)

            for player_id, stats in session_stats.items():
                # シーズン別集計
                if session.season_id:
                    if session.season_id not in self.stats_by_season:
                        self.stats_by_season[session.season_id] = {}

                    season_stats = self.stats_by_season[session.season_id]
                    if player_id in season_stats:
                        season_stats[player_id].merge(stats)
                    else:
                        season_stats[player_id] = PlayerStats(
                            player_id=stats.player_id,
                            display_name=stats.display_name,
                            league=stats.league,
                        )
                        season_stats[player_id].merge(stats)

                # 全期間集計
                if player_id in self.all_stats:
                    self.all_stats[player_id].merge(stats)
                else:
                    self.all_stats[player_id] = PlayerStats(
                        player_id=stats.player_id,
                        display_name=stats.display_name,
                        league=stats.league,
                    )
                    self.all_stats[player_id].merge(stats)

    def _format_net(self, net: int) -> str:
        """収支をフォーマット（+/-付き）"""
        if net > 0:
            return f"+{net}"
        return str(net)

    def _write_csv(self, stats_dict: Dict[str, PlayerStats], output_path: Path) -> None:
        """スタッツをCSVに出力"""
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(self.CSV_HEADERS)

            # ハンド数でソート
            sorted_stats = sorted(
                stats_dict.values(),
                key=lambda s: s.hands,
                reverse=True
            )

            for stats in sorted_stats:
                row = [
                    stats.player_id,
                    stats.display_name,
                    stats.league,
                    self._format_net(stats.net),
                    stats.hands,
                    stats.vpip,
                    stats.pfr,
                    stats.three_bet,
                    stats.fold_to_3bet,
                    stats.cb,
                    stats.wtsd,
                    stats.wdsd,
                ]
                writer.writerow(row)

    def output_all_stats(self) -> Path:
        """全期間スタッツをCSV出力"""
        output_path = self.data_dir / "all_stats.csv"
        self._write_csv(self.all_stats, output_path)
        if self.verbose:
            print(f"Wrote all_stats.csv with {len(self.all_stats)} players")
        return output_path

    def output_season_stats(self) -> List[Path]:
        """シーズン別スタッツをCSV出力"""
        output_paths = []
        for season_id, stats_dict in self.stats_by_season.items():
            output_path = self.data_dir / f"season_{season_id}_stats.csv"
            self._write_csv(stats_dict, output_path)
            output_paths.append(output_path)
            if self.verbose:
                print(f"Wrote season_{season_id}_stats.csv with {len(stats_dict)} players")
        return output_paths


if __name__ == "__main__":
    # テスト用
    config = ConfigLoader()
    registry = PlayerRegistry(config)
    aggregator = StatsAggregator(config, registry, verbose=True)

    sessions = aggregator.discover_sessions()
    print(f"Found {len(sessions)} sessions")

    if sessions:
        aggregator.aggregate(sessions)
        aggregator.output_all_stats()
        aggregator.output_season_stats()
        registry.save()
