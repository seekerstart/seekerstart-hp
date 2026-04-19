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
from precalc_importer import PreCalcImporter


BB_SIZE = 20  # 1BB = 20チップ


@dataclass
class SessionInfo:
    """セッション情報を保持するデータクラス"""
    date: datetime
    session_dir: Path
    csv_path: Optional[Path] = None
    ledger_path: Optional[Path] = None
    season_id: Optional[int] = None
    stats_json_path: Optional[Path] = None
    is_precalculated: bool = False


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

    RAW_CSV_HEADERS = [
        "player_id", "プレイヤー", "リーグ", "収支", "bb_size", "ハンド数", "参加節数",
        "VPIP", "VPIP_count", "VPIP_hands",
        "PFR", "PFR_count", "PFR_hands",
        "3bet", "3bet_count", "3bet_hands",
        "Fold to 3bet", "Fold_to_3bet_count", "Fold_to_3bet_hands",
        "CB", "CB_count", "CB_hands",
        "WTSD", "WTSD_count", "WTSD_hands",
        "W$SD", "W$SD_count", "W$SD_hands"
    ]

    RAW_SESSION_STATS_HEADERS = [
        "session_date", "season_id", "player_id", "プレイヤー", "リーグ",
        "収支", "bb_size", "ハンド数",
        "VPIP", "VPIP_count", "VPIP_hands",
        "PFR", "PFR_count", "PFR_hands",
        "3bet", "3bet_count", "3bet_hands",
        "Fold to 3bet", "Fold_to_3bet_count", "Fold_to_3bet_hands",
        "CB", "CB_count", "CB_hands",
        "WTSD", "WTSD_count", "WTSD_hands",
        "W$SD", "W$SD_count", "W$SD_hands"
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
        # 凍結シーズンのプレイヤー参加節数: season_id -> player_id -> count
        self.frozen_player_session_counts: Dict[int, Dict[str, int]] = {}

    def discover_sessions(self) -> List[SessionInfo]:
        """
        data/hand_histories/内のセッションを検出

        凍結シーズンはスキップする。
        日付ディレクトリ直下にJSONがあれば計算済みセッションとして扱う。

        ディレクトリ構造:
            hand_histories/
                {YYYYMMDD}/
                    player-stats-all-time-*.json  (計算済みスタッツ)
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

            # シーズンを特定
            season_config = self.config.get_season_by_date(date)
            season_id = season_config["id"] if season_config else None

            # 凍結シーズンはスキップ
            if season_config and season_config.get("frozen"):
                if self.verbose:
                    print(f"Skipping frozen season {season_id} date {date_str}")
                continue

            # 日付ディレクトリ直下の計算済みJSON を検索
            json_files = sorted(date_dir.glob("player-stats-all-time-*.json"))
            if json_files:
                session = SessionInfo(
                    date=date,
                    session_dir=date_dir,
                    season_id=season_id,
                    stats_json_path=json_files[-1],  # 最新のJSONを使用
                    is_precalculated=True,
                )
                sessions.append(session)
                if self.verbose:
                    print(f"Found precalculated JSON: {json_files[-1].name}")
                continue  # JSONがあればテーブルディレクトリはスキップ

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

                session = SessionInfo(date=date, session_dir=table_dir, season_id=season_id)

                # テーブルディレクトリ直下のCSVファイルを検索
                csv_files = list(table_dir.glob("poker_now_log_*.csv"))
                if csv_files:
                    session.csv_path = csv_files[0]

                ledger_files = list(table_dir.glob("ledger_*.csv"))
                if ledger_files:
                    session.ledger_path = ledger_files[0]

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

        # Ledgerから収支を取得（チップ → BB 変換）
        if session.ledger_path and session.ledger_path.exists():
            ledger_parser = LedgerParser(str(session.ledger_path))
            ledger_data = ledger_parser.parse()

            for player_id, ledger_info in ledger_data.items():
                canonical_id = self.registry.get_canonical_id(player_id)
                net_bb = ledger_info["net"] / BB_SIZE
                if canonical_id in session_stats:
                    session_stats[canonical_id].net = net_bb
                elif player_id in session_stats:
                    session_stats[player_id].net = net_bb

        if self.verbose:
            print(f"  Found {len(session_stats)} players, {unique_hands} hands")

        return session_stats, unique_hands

    def _accumulate_session(self, session_stats: Dict[str, PlayerStats],
                            date_str: str, season_id: Optional[int],
                            unique_hands: int = 0) -> None:
        """セッションデータを蓄積する"""
        # ユニークハンド数を加算
        self.total_unique_hands += unique_hands
        if season_id:
            self.unique_hands_by_season.setdefault(season_id, 0)
            self.unique_hands_by_season[season_id] += unique_hands
            # セッション日付を記録
            self.session_dates_by_season.setdefault(season_id, set()).add(date_str)
            # セッション→シーズンIDマッピング
            self.session_season_map[date_str] = season_id

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
            self.player_session_dates.setdefault(player_id, set()).add(date_str)

            # シーズン別の参加日を記録
            if season_id:
                self.player_session_dates_by_season.setdefault(season_id, {})
                self.player_session_dates_by_season[season_id].setdefault(
                    player_id, set()
                ).add(date_str)

            # シーズン別集計
            if season_id:
                self.stats_by_season.setdefault(season_id, {})
                if player_id in self.stats_by_season[season_id]:
                    self.stats_by_season[season_id][player_id].merge(stats)
                else:
                    self.stats_by_season[season_id][player_id] = PlayerStats(
                        player_id=stats.player_id,
                        display_name=stats.display_name,
                        league=stats.league,
                    )
                    self.stats_by_season[season_id][player_id].merge(stats)

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

    def _process_precalculated_sessions(self, sessions: List[SessionInfo]) -> None:
        """計算済みJSONセッションを処理する"""
        if not sessions:
            return

        importer = PreCalcImporter(self.registry)

        # シーズンごとにグルーピング
        by_season: Dict[int, List[SessionInfo]] = {}
        for session in sessions:
            by_season.setdefault(session.season_id, []).append(session)

        for season_id, season_sessions in by_season.items():
            sorted_sessions = sorted(season_sessions, key=lambda s: s.date)
            season_config = self.config.get_season_by_id(season_id)

            previous_cumulative = None

            for session in sorted_sessions:
                date_str = session.date.strftime("%Y%m%d")

                if self.verbose:
                    print(f"Processing precalculated session: {date_str}")

                current_cumulative = importer.import_json(
                    session.stats_json_path, season_id
                )

                # リーグを設定
                if season_config:
                    for pid, stats in current_cumulative.items():
                        stats.league = self.config.get_player_league(
                            pid, season_config
                        )

                # 累積差分でセッション別データを算出
                if previous_cumulative is None:
                    # 初回セッション = 累積そのまま
                    session_delta = {}
                    for pid, stats in current_cumulative.items():
                        d = PlayerStats(
                            player_id=stats.player_id,
                            display_name=stats.display_name,
                            league=stats.league,
                        )
                        d.merge(stats)
                        session_delta[pid] = d
                else:
                    session_delta = PreCalcImporter.compute_delta(
                        current_cumulative, previous_cumulative
                    )
                    # デルタのリーグを設定
                    if season_config:
                        for pid, stats in session_delta.items():
                            stats.league = self.config.get_player_league(
                                pid, season_config
                            )

                if self.verbose:
                    print(f"  Found {len(session_delta)} players in session delta")

                # 蓄積
                self._accumulate_session(session_delta, date_str, season_id)

                previous_cumulative = current_cumulative

    def load_frozen_season(self, season_id: int) -> None:
        """凍結シーズンのraw counts CSVを読み込みスタッツを復元する"""
        raw_csv_path = self.data_dir / f"season_{season_id}_stats_raw.csv"
        if not raw_csv_path.exists():
            if self.verbose:
                print(f"Warning: Frozen season {season_id} raw CSV not found: {raw_csv_path}")
            return

        if self.verbose:
            print(f"Loading frozen season {season_id} from {raw_csv_path}")

        season_stats = {}

        with open(raw_csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                player_id = row["player_id"]
                net_str = row["収支"].replace("+", "")
                stats = PlayerStats(
                    player_id=player_id,
                    display_name=row["プレイヤー"],
                    league=row["リーグ"],
                    net=float(net_str),
                    hands=int(row["ハンド数"]),
                    vpip_count=int(row["VPIP_count"]),
                    vpip_hands=int(row["VPIP_hands"]),
                    pfr_count=int(row["PFR_count"]),
                    pfr_hands=int(row["PFR_hands"]),
                    three_bet_count=int(row["3bet_count"]),
                    three_bet_hands=int(row["3bet_hands"]),
                    fold_to_3bet_count=int(row["Fold_to_3bet_count"]),
                    fold_to_3bet_hands=int(row["Fold_to_3bet_hands"]),
                    cb_count=int(row["CB_count"]),
                    cb_hands=int(row["CB_hands"]),
                    wtsd_count=int(row["WTSD_count"]),
                    wtsd_hands=int(row["WTSD_hands"]),
                    wdsd_count=int(row["W$SD_count"]),
                )

                season_stats[player_id] = stats

                # プレイヤー参加節数を記録
                player_sessions = int(row["参加節数"])
                self.frozen_player_session_counts.setdefault(
                    season_id, {}
                )[player_id] = player_sessions

        # シーズン別スタッツに格納
        self.stats_by_season[season_id] = season_stats

        # 全期間スタッツに加算
        for pid, stats in season_stats.items():
            if pid in self.all_stats:
                self.all_stats[pid].merge(stats)
            else:
                self.all_stats[pid] = PlayerStats(
                    player_id=stats.player_id,
                    display_name=stats.display_name,
                    league=stats.league,
                )
                self.all_stats[pid].merge(stats)

        if self.verbose:
            print(f"  Loaded {len(season_stats)} players from frozen season {season_id}")

    def _load_frozen_session_stats(self, season_id: int) -> None:
        """凍結シーズンの節別データを読み込む"""
        path = self.data_dir / f"season_{season_id}_session_stats_raw.csv"
        if not path.exists():
            if self.verbose:
                print(f"  Warning: Frozen session stats not found: {path}")
            return

        if self.verbose:
            print(f"  Loading frozen session stats from {path}")

        row_count = 0
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                date_str = row["session_date"]
                player_id = row["player_id"]
                net_str = row["収支"].replace("+", "")

                stats = PlayerStats(
                    player_id=player_id,
                    display_name=row["プレイヤー"],
                    league=row["リーグ"],
                    net=float(net_str),
                    hands=int(row["ハンド数"]),
                    vpip_count=int(row["VPIP_count"]),
                    vpip_hands=int(row["VPIP_hands"]),
                    pfr_count=int(row["PFR_count"]),
                    pfr_hands=int(row["PFR_hands"]),
                    three_bet_count=int(row["3bet_count"]),
                    three_bet_hands=int(row["3bet_hands"]),
                    fold_to_3bet_count=int(row["Fold_to_3bet_count"]),
                    fold_to_3bet_hands=int(row["Fold_to_3bet_hands"]),
                    cb_count=int(row["CB_count"]),
                    cb_hands=int(row["CB_hands"]),
                    wtsd_count=int(row["WTSD_count"]),
                    wtsd_hands=int(row["WTSD_hands"]),
                    wdsd_count=int(row["W$SD_count"]),
                )

                # stats_by_session に追加
                if date_str not in self.stats_by_session:
                    self.stats_by_session[date_str] = {}
                self.stats_by_session[date_str][player_id] = stats

                # session_season_map に追加
                self.session_season_map[date_str] = season_id

                # player_session_dates に追加
                self.player_session_dates.setdefault(player_id, set()).add(date_str)

                # player_session_dates_by_season に追加
                self.player_session_dates_by_season.setdefault(season_id, {})
                self.player_session_dates_by_season[season_id].setdefault(
                    player_id, set()
                ).add(date_str)

                row_count += 1

        if self.verbose:
            sessions_loaded = len({
                d for d in self.stats_by_session
                if self.session_season_map.get(d) == season_id
            })
            print(f"  Loaded {row_count} rows across {sessions_loaded} sessions")

    def aggregate(self, sessions: List[SessionInfo]) -> None:
        """全セッションを集計"""
        # 1. 凍結シーズンを読み込み（集計 + 節別）
        for season_config in self.config.get_all_seasons():
            if season_config.get("frozen"):
                sid = season_config["id"]
                self.load_frozen_season(sid)
                self._load_frozen_session_stats(sid)
                # 凍結シーズンのセッション情報を記録
                self.session_counts_by_season[sid] = season_config.get("session_count", 0)
                frozen_dates = set(season_config.get("session_dates", []))
                self.session_dates_by_season[sid] = frozen_dates

        # 2. セッションを計算済みと通常に分離
        precalc_sessions = [s for s in sessions if s.is_precalculated]
        regular_sessions = [s for s in sessions if not s.is_precalculated]

        # 3. アクティブセッションの開催回数をカウント
        unique_dates: set = set()
        unique_dates_by_season: Dict[int, set] = {}

        for session in sessions:
            date_str = session.date.strftime("%Y%m%d")
            unique_dates.add(date_str)
            if session.season_id:
                unique_dates_by_season.setdefault(session.season_id, set()).add(date_str)

        for season_id, dates in unique_dates_by_season.items():
            self.session_counts_by_season[season_id] = len(dates)

        # 4. 計算済みセッションを処理
        self._process_precalculated_sessions(precalc_sessions)

        # 5. 通常セッションを処理
        for session in regular_sessions:
            session_stats, unique_hands = self.process_session(session)
            date_str = session.date.strftime("%Y%m%d")
            self._accumulate_session(session_stats, date_str, session.season_id, unique_hands)

        # 6. 全体のセッション数を更新
        all_dates = set()
        for dates in self.session_dates_by_season.values():
            all_dates.update(dates)
        self.total_session_count = len(all_dates)

    def _update_all_stats_league(self) -> None:
        """全期間スタッツのリーグを最新シーズンの情報で更新する"""
        current_season = self.config.get_current_season()
        if not current_season:
            return
        for player_id, stats in self.all_stats.items():
            stats.league = self.config.get_player_league(player_id, current_season)

    def _format_net(self, net: float) -> str:
        """収支をフォーマット（+/-付き、BB単位）"""
        rounded = round(net, 2)
        if rounded == 0:
            return "0"
        # 小数点以下の不要なゼロを除去
        formatted = f"{abs(rounded):.2f}".rstrip("0").rstrip(".")
        if rounded > 0:
            return f"+{formatted}"
        return f"-{formatted}"

    def _get_season_session_counts(self, season_id: int) -> Dict[str, int]:
        """シーズン別のプレイヤー参加節数を取得する"""
        # アクティブセッションからの参加日数
        if season_id in self.player_session_dates_by_season:
            return {
                pid: len(dates)
                for pid, dates in self.player_session_dates_by_season[season_id].items()
            }
        # 凍結シーズンからの参加節数
        if season_id in self.frozen_player_session_counts:
            return self.frozen_player_session_counts[season_id]
        return {}

    def _get_all_session_counts(self) -> Dict[str, int]:
        """全期間のプレイヤー参加節数を取得する"""
        counts: Dict[str, int] = {}
        # player_session_dates からの参加日数（アクティブ + 読込済み凍結セッション）
        for pid, dates in self.player_session_dates.items():
            counts[pid] = counts.get(pid, 0) + len(dates)
        # 凍結シーズンの参加節数（節別データが読み込めなかったシーズンのみ）
        for season_id, player_counts in self.frozen_player_session_counts.items():
            if season_id in self.player_session_dates_by_season:
                continue  # 節別データが読込済みなので player_session_dates で計上済み
            for pid, count in player_counts.items():
                counts[pid] = counts.get(pid, 0) + count
        return counts

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
                    self._format_net(stats.net * BB_SIZE),
                    BB_SIZE,
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

    def _write_raw_csv(self, stats_dict: Dict[str, PlayerStats], output_path: Path,
                       session_counts: Optional[Dict[str, int]] = None) -> None:
        """スタッツをraw counts CSV（分子/分母を含む完全版）に出力"""
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(self.RAW_CSV_HEADERS)

            # ハンド数でソート
            sorted_stats = sorted(
                stats_dict.values(),
                key=lambda s: s.hands,
                reverse=True
            )

            for stats in sorted_stats:
                player_sessions = 0
                if session_counts and stats.player_id in session_counts:
                    player_sessions = session_counts[stats.player_id]

                row = [
                    stats.player_id,
                    stats.display_name,
                    stats.league,
                    self._format_net(stats.net),
                    BB_SIZE,
                    stats.hands,
                    player_sessions,
                    stats.vpip,
                    stats.vpip_count,
                    stats.vpip_hands,
                    stats.pfr,
                    stats.pfr_count,
                    stats.pfr_hands,
                    stats.three_bet,
                    stats.three_bet_count,
                    stats.three_bet_hands,
                    stats.fold_to_3bet,
                    stats.fold_to_3bet_count,
                    stats.fold_to_3bet_hands,
                    stats.cb,
                    stats.cb_count,
                    stats.cb_hands,
                    stats.wtsd,
                    stats.wtsd_count,
                    stats.wtsd_hands,
                    stats.wdsd,
                    stats.wdsd_count,
                    stats.wtsd_count,
                ]
                writer.writerow(row)

    def output_all_stats(self) -> Path:
        """全期間スタッツをCSV出力"""
        output_path = self.data_dir / "all_stats.csv"
        # リーグを最新シーズンの情報で更新
        self._update_all_stats_league()
        all_session_counts = self._get_all_session_counts()
        self._write_csv(self.all_stats, output_path, session_counts=all_session_counts)
        if self.verbose:
            print(f"Wrote all_stats.csv with {len(self.all_stats)} players")
        return output_path

    def output_season_stats(self) -> List[Path]:
        """シーズン別スタッツをCSV出力"""
        output_paths = []
        for season_id, stats_dict in self.stats_by_season.items():
            output_path = self.data_dir / f"season_{season_id}_stats.csv"
            season_session_counts = self._get_season_session_counts(season_id)
            self._write_csv(stats_dict, output_path, session_counts=season_session_counts)
            output_paths.append(output_path)
            if self.verbose:
                print(f"Wrote season_{season_id}_stats.csv with {len(stats_dict)} players")
        return output_paths

    def output_raw_season_stats(self) -> List[Path]:
        """シーズン別raw counts CSVを出力"""
        output_paths = []
        for season_id, stats_dict in self.stats_by_season.items():
            output_path = self.data_dir / f"season_{season_id}_stats_raw.csv"
            season_session_counts = self._get_season_session_counts(season_id)
            self._write_raw_csv(stats_dict, output_path, session_counts=season_session_counts)
            output_paths.append(output_path)
            if self.verbose:
                print(f"Wrote season_{season_id}_stats_raw.csv with {len(stats_dict)} players")
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
                        self._format_net(stats.net * BB_SIZE),
                        BB_SIZE,
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

    def output_raw_session_stats(self) -> Path:
        """節ごとの個人成績をraw counts CSVに出力"""
        output_path = self.data_dir / "session_stats_raw.csv"
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(self.RAW_SESSION_STATS_HEADERS)

            for date_str in sorted(self.stats_by_session.keys()):
                season_id = self.session_season_map.get(date_str, "")
                players = self.stats_by_session[date_str]

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
                        BB_SIZE,
                        stats.hands,
                        stats.vpip,
                        stats.vpip_count,
                        stats.vpip_hands,
                        stats.pfr,
                        stats.pfr_count,
                        stats.pfr_hands,
                        stats.three_bet,
                        stats.three_bet_count,
                        stats.three_bet_hands,
                        stats.fold_to_3bet,
                        stats.fold_to_3bet_count,
                        stats.fold_to_3bet_hands,
                        stats.cb,
                        stats.cb_count,
                        stats.cb_hands,
                        stats.wtsd,
                        stats.wtsd_count,
                        stats.wtsd_hands,
                        stats.wdsd,
                        stats.wdsd_count,
                        stats.wtsd_count,
                    ]
                    writer.writerow(row)

        if self.verbose:
            total_rows = sum(len(p) for p in self.stats_by_session.values())
            print(f"Wrote session_stats_raw.csv with {total_rows} rows across {len(self.stats_by_session)} sessions")

        # シーズン別の session_stats_raw.csv を出力
        sessions_by_season: Dict[int, Dict[str, Dict[str, PlayerStats]]] = {}
        for date_str, players in self.stats_by_session.items():
            sid = self.session_season_map.get(date_str)
            if sid is not None:
                sessions_by_season.setdefault(sid, {})[date_str] = players

        for sid, sessions in sessions_by_season.items():
            season_path = self.data_dir / f"season_{sid}_session_stats_raw.csv"
            with open(season_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(self.RAW_SESSION_STATS_HEADERS)
                for d_str in sorted(sessions.keys()):
                    sorted_players = sorted(
                        sessions[d_str].values(),
                        key=lambda s: s.hands,
                        reverse=True,
                    )
                    for stats in sorted_players:
                        row = [
                            d_str, sid,
                            stats.player_id, stats.display_name, stats.league,
                            self._format_net(stats.net), BB_SIZE, stats.hands,
                            stats.vpip, stats.vpip_count, stats.vpip_hands,
                            stats.pfr, stats.pfr_count, stats.pfr_hands,
                            stats.three_bet, stats.three_bet_count, stats.three_bet_hands,
                            stats.fold_to_3bet, stats.fold_to_3bet_count, stats.fold_to_3bet_hands,
                            stats.cb, stats.cb_count, stats.cb_hands,
                            stats.wtsd, stats.wtsd_count, stats.wtsd_hands,
                            stats.wdsd, stats.wdsd_count, stats.wtsd_count,
                        ]
                        writer.writerow(row)
            if self.verbose:
                rows = sum(len(p) for p in sessions.values())
                print(f"Wrote season_{sid}_session_stats_raw.csv with {rows} rows")

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
            season_session_counts = self._get_season_session_counts(season_id)

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
                            self._format_net(stats.net * BB_SIZE),
                            BB_SIZE,
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
        aggregator.output_raw_season_stats()
        aggregator.output_league_stats()
        aggregator.output_session_stats()
        aggregator.output_raw_session_stats()
        registry.save()
