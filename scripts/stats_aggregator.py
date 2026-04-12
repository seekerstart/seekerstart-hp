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
        "player_id", "プレイヤー", "リーグ", "収支", "bb_size", "ハンド数", "参加節数",
        "VPIP", "VPIP_hands", "PFR", "PFR_hands", "3bet", "3bet_hands",
        "Fold to 3bet", "Fold to 3bet_hands", "CB", "CB_hands",
        "WTSD", "WTSD_hands", "W$SD", "W$SD_hands"
    ]

    SESSION_STATS_HEADERS = [
        "session_date", "season_id", "player_id", "プレイヤー", "リーグ",
        "収支", "bb_size", "ハンド数",
        "VPIP", "VPIP_hands", "PFR", "PFR_hands", "3bet", "3bet_hands",
        "Fold to 3bet", "Fold to 3bet_hands", "CB", "CB_hands",
        "WTSD", "WTSD_hands", "W$SD", "W$SD_hands"
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
        # ユニークハンド数の追跡
        self.total_unique_hands: int = 0
        self.unique_hands_by_season: Dict[int, int] = {}
        # セッション数の追跡（開催回数）
        self.total_session_count: int = 0
        self.session_counts_by_season: Dict[int, int] = {}
        # 節別スタッツ: date_str -> player_id -> PlayerStats
        self.stats_by_session: Dict[str, Dict[str, PlayerStats]] = {}
        # セッション→シーズンIDマッピング: date_str -> season_id
        self.session_season_map: Dict[str, int] = {}
        # プレイヤーの参加日セット: player_id -> set of date_str
        self.player_session_dates: Dict[str, set] = {}
        # シーズン別の参加日セット: season_id -> player_id -> set of date_str
        self.player_session_dates_by_season: Dict[int, Dict[str, set]] = {}
        # シーズン別のセッション日付: season_id -> set of date_str
        self.session_dates_by_season: Dict[int, set] = {}

    def discover_sessions(self) -> List[SessionInfo]:
        """
        data/hand_histories/内のセッションを検出

        ディレクトリ構造:
            hand_histories/
                {YYYYMMDD}/
                    {table{N} または YYYYMMDD_table{N}}/
                        poker_now_log_*.csv
                        ledger_*.csv
        """
        sessions = []
        hand_histories_dir = self.data_dir / "hand_histories"

        if not hand_histories_dir.exists():
            if self.verbose:
                print(f"Warning: {hand_histories_dir} does not exist")
            return sessions

        # 日付ディレクトリを走査
        for date_dir in sorted(hand_histories_dir.iterdir()):
            if not date_dir.is_dir():
                continue

            # ディレクトリ名から日付を抽出 (例: 20260112)
            date_str = date_dir.name
            try:
                date = datetime.strptime(date_str, "%Y%m%d")
            except ValueError:
                if self.verbose:
                    print(f"Warning: Cannot parse date from {date_str}")
                continue

            # テーブルディレクトリを走査
            for table_dir in sorted(date_dir.iterdir()):
                if not table_dir.is_dir():
                    continue

                # テーブルディレクトリ名の検証 (table{N} または YYYYMMDD_table{N})
                table_name = table_dir.name
                if not ("table" in table_name.lower()):
                    if self.verbose:
                        print(f"Warning: Skipping non-table directory {table_name}")
                    continue

                session = SessionInfo(date=date, session_dir=table_dir)

                # テーブルディレクトリ直下のCSVファイルを検索
                csv_files = list(table_dir.glob("poker_now_log_*.csv"))
                if csv_files:
                    session.csv_path = csv_files[0]

                ledger_files = list(table_dir.glob("ledger_*.csv"))
                if ledger_files:
                    session.ledger_path = ledger_files[0]

                # シーズンを特定
                season = self.config.get_season_by_date(date)
                if season:
                    session.season_id = season["id"]

                sessions.append(session)

        return sessions

    def process_session(self, session: SessionInfo) -> tuple:
        """
        1セッションを処理してスタッツを計算

        Returns:
            tuple: (session_stats: Dict[str, PlayerStats], unique_hands: int)
        """
        if self.verbose:
            print(f"Processing session: {session.session_dir.name}")

        if not session.csv_path or not session.csv_path.exists():
            if self.verbose:
                print(f"  Warning: No CSV file found")
            return {}, 0

        # CSVをパース
        parser = PokerNowParser(str(session.csv_path))
        formatted_text, player_names = parser.parse()

        # パース済みのテキストを使用（csv.readerでクォートが正しく処理されている）
        raw_text = parser.raw_text

        # ID変更を検出
        self.registry.process_id_changes(raw_text)

        # プレイヤーIDマップを取得
        player_id_map = extract_player_id_map(raw_text)

        # ハンド履歴を取得
        histories = [h for h in formatted_text.split("\n\n") if h.strip()]
        if not histories:
            if self.verbose:
                print(f"  Warning: No hands found")
            return {}, 0

        unique_hands = len(histories)

        # スタッツ計算
        calculator = StatsCalculator(histories)
        all_players = calculator.get_all_players()

        session_stats = {}
        for player_name in all_players:
            stats = calculator.calculate_all(player_name)
            raw_player_id = player_id_map.get(player_name, player_name)
            # canonical_id に変換して一貫したIDを使用
            canonical_id = self.registry.get_canonical_id(raw_player_id)
            stats.player_id = canonical_id
            registered_name = self.registry.get_display_name(canonical_id)
            stats.display_name = registered_name if registered_name else player_name

            # リーグを設定
            if session.season_id:
                season = self.config.get_season_by_id(session.season_id)
                if season:
                    stats.league = self.config.get_player_league(canonical_id, season)

            # プレイヤーを登録（raw_player_id も登録してエイリアス追加の機会を与える）
            self.registry.register_player(raw_player_id, player_name)

            # 同一セッション内で同じcanonical_idが既に存在する場合はマージ
            # （プレイヤーがセッション中に表示名を変更した場合に発生）
            if canonical_id in session_stats:
                session_stats[canonical_id].merge(stats)
            else:
                session_stats[canonical_id] = stats

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
            print(f"  Found {len(session_stats)} players, {unique_hands} hands")

        return session_stats, unique_hands

    def aggregate(self, sessions: List[SessionInfo]) -> None:
        """全セッションを集計"""
        # 開催回数をカウント（ユニークな日付ごと）
        unique_dates: set = set()
        unique_dates_by_season: Dict[int, set] = {}

        for session in sessions:
            date_str = session.date.strftime("%Y%m%d")
            unique_dates.add(date_str)
            if session.season_id:
                if session.season_id not in unique_dates_by_season:
                    unique_dates_by_season[session.season_id] = set()
                unique_dates_by_season[session.season_id].add(date_str)

        self.total_session_count = len(unique_dates)
        for season_id, dates in unique_dates_by_season.items():
            self.session_counts_by_season[season_id] = len(dates)

        for session in sessions:
            session_stats, unique_hands = self.process_session(session)
            date_str = session.date.strftime("%Y%m%d")

            # ユニークハンド数を加算
            self.total_unique_hands += unique_hands
            if session.season_id:
                if session.season_id not in self.unique_hands_by_season:
                    self.unique_hands_by_season[session.season_id] = 0
                self.unique_hands_by_season[session.season_id] += unique_hands
                # セッション日付を記録
                if session.season_id not in self.session_dates_by_season:
                    self.session_dates_by_season[session.season_id] = set()
                self.session_dates_by_season[session.season_id].add(date_str)
                # セッション→シーズンIDマッピング
                self.session_season_map[date_str] = session.season_id

            for player_id, stats in session_stats.items():
                # 節別スタッツを蓄積（同日の複数テーブルはマージ）
                if date_str not in self.stats_by_session:
                    self.stats_by_session[date_str] = {}
                if player_id in self.stats_by_session[date_str]:
                    self.stats_by_session[date_str][player_id].merge(stats)
                else:
                    self.stats_by_session[date_str][player_id] = PlayerStats(
                        player_id=stats.player_id,
                        display_name=stats.display_name,
                        league=stats.league,
                    )
                    self.stats_by_session[date_str][player_id].merge(stats)

                # プレイヤーの参加日を記録
                if player_id not in self.player_session_dates:
                    self.player_session_dates[player_id] = set()
                self.player_session_dates[player_id].add(date_str)

                # シーズン別の参加日を記録
                if session.season_id:
                    if session.season_id not in self.player_session_dates_by_season:
                        self.player_session_dates_by_season[session.season_id] = {}
                    if player_id not in self.player_session_dates_by_season[session.season_id]:
                        self.player_session_dates_by_season[session.season_id][player_id] = set()
                    self.player_session_dates_by_season[session.season_id][player_id].add(date_str)

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

    def _update_all_stats_league(self) -> None:
        """全期間スタッツのリーグを最新シーズンの情報で更新する"""
        current_season = self.config.get_current_season()
        if not current_season:
            return
        for player_id, stats in self.all_stats.items():
            stats.league = self.config.get_player_league(player_id, current_season)

    def _format_net(self, net: int) -> str:
        """収支をフォーマット（+/-付き）"""
        if net > 0:
            return f"+{net}"
        return str(net)

    def _write_csv(self, stats_dict: Dict[str, PlayerStats], output_path: Path,
                   session_counts: Optional[Dict[str, int]] = None) -> None:
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
                # 参加節数を取得
                player_sessions = 0
                if session_counts and stats.player_id in session_counts:
                    player_sessions = session_counts[stats.player_id]

                row = [
                    stats.player_id,
                    stats.display_name,
                    stats.league,
                    self._format_net(stats.net),
                    20,  # bb_size（現時点のデフォルト値）
                    stats.hands,
                    player_sessions,
                    stats.vpip,
                    stats.vpip_hands,
                    stats.pfr,
                    stats.pfr_hands,
                    stats.three_bet,
                    stats.three_bet_hands,
                    stats.fold_to_3bet,
                    stats.fold_to_3bet_hands,
                    stats.cb,
                    stats.cb_hands,
                    stats.wtsd,
                    stats.wtsd_hands,
                    stats.wdsd,
                    stats.wtsd_count,
                ]
                writer.writerow(row)

    def output_all_stats(self) -> Path:
        """全期間スタッツをCSV出力"""
        output_path = self.data_dir / "all_stats.csv"
        # リーグを最新シーズンの情報で更新
        self._update_all_stats_league()
        # 全期間の参加節数
        all_session_counts = {
            pid: len(dates) for pid, dates in self.player_session_dates.items()
        }
        self._write_csv(self.all_stats, output_path, session_counts=all_session_counts)
        if self.verbose:
            print(f"Wrote all_stats.csv with {len(self.all_stats)} players")
        return output_path

    def output_season_stats(self) -> List[Path]:
        """シーズン別スタッツをCSV出力"""
        output_paths = []
        for season_id, stats_dict in self.stats_by_season.items():
            output_path = self.data_dir / f"season_{season_id}_stats.csv"
            # シーズン別の参加節数
            season_session_counts = {}
            if season_id in self.player_session_dates_by_season:
                season_session_counts = {
                    pid: len(dates)
                    for pid, dates in self.player_session_dates_by_season[season_id].items()
                }
            self._write_csv(stats_dict, output_path, session_counts=season_session_counts)
            output_paths.append(output_path)
            if self.verbose:
                print(f"Wrote season_{season_id}_stats.csv with {len(stats_dict)} players")
        return output_paths

    def output_session_stats(self) -> Path:
        """節ごとの個人成績をCSV出力"""
        output_path = self.data_dir / "session_stats.csv"
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(self.SESSION_STATS_HEADERS)

            for date_str in sorted(self.stats_by_session.keys()):
                season_id = self.session_season_map.get(date_str, "")
                players = self.stats_by_session[date_str]

                # ハンド数でソート
                sorted_players = sorted(
                    players.values(),
                    key=lambda s: s.hands,
                    reverse=True
                )

                for stats in sorted_players:
                    row = [
                        date_str,
                        season_id,
                        stats.player_id,
                        stats.display_name,
                        stats.league,
                        self._format_net(stats.net),
                        20,  # bb_size
                        stats.hands,
                        stats.vpip,
                        stats.vpip_hands,
                        stats.pfr,
                        stats.pfr_hands,
                        stats.three_bet,
                        stats.three_bet_hands,
                        stats.fold_to_3bet,
                        stats.fold_to_3bet_hands,
                        stats.cb,
                        stats.cb_hands,
                        stats.wtsd,
                        stats.wtsd_hands,
                        stats.wdsd,
                        stats.wtsd_count,
                    ]
                    writer.writerow(row)

        if self.verbose:
            total_rows = sum(len(p) for p in self.stats_by_session.values())
            print(f"Wrote session_stats.csv with {total_rows} rows across {len(self.stats_by_session)} sessions")
        return output_path


    def output_league_stats(self) -> List[Path]:
        """シーズン別・リーグ別スタッツをCSV出力（収支順にランク付き）"""
        output_paths = []
        league_headers = ["順位"] + self.CSV_HEADERS

        for season_id, stats_dict in self.stats_by_season.items():
            # リーグごとにグルーピング
            league_groups: Dict[str, List[PlayerStats]] = {}
            for player_id, stats in stats_dict.items():
                league = stats.league
                if league not in league_groups:
                    league_groups[league] = []
                league_groups[league].append(stats)

            # シーズン別の参加節数
            season_session_counts = {}
            if season_id in self.player_session_dates_by_season:
                season_session_counts = {
                    pid: len(dates)
                    for pid, dates in self.player_session_dates_by_season[season_id].items()
                }

            for league_name, players in league_groups.items():
                # 収支降順でソート
                sorted_players = sorted(players, key=lambda s: s.net, reverse=True)

                output_path = self.data_dir / f"season_{season_id}_{league_name}_stats.csv"
                with open(output_path, "w", encoding="utf-8", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow(league_headers)

                    for rank, stats in enumerate(sorted_players, start=1):
                        player_sessions = season_session_counts.get(stats.player_id, 0)
                        row = [
                            rank,
                            stats.player_id,
                            stats.display_name,
                            stats.league,
                            self._format_net(stats.net),
                            20,  # bb_size
                            stats.hands,
                            player_sessions,
                            stats.vpip,
                            stats.vpip_hands,
                            stats.pfr,
                            stats.pfr_hands,
                            stats.three_bet,
                            stats.three_bet_hands,
                            stats.fold_to_3bet,
                            stats.fold_to_3bet_hands,
                            stats.cb,
                            stats.cb_hands,
                            stats.wtsd,
                            stats.wtsd_hands,
                            stats.wdsd,
                            stats.wtsd_count,
                        ]
                        writer.writerow(row)

                output_paths.append(output_path)
                if self.verbose:
                    print(f"Wrote season_{season_id}_{league_name}_stats.csv with {len(sorted_players)} players")

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
        aggregator.output_league_stats()
        aggregator.output_session_stats()
        registry.save()
