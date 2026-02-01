"""
Preseasonデータフォーマット変換スクリプト
横型のスプレッドシート形式からall_stats.csv形式への変換
"""

import csv
import re
import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional


class PreseasonFormatter:
    """Preseasonデータをフォーマット変換するクラス"""

    # 目標フォーマットのヘッダー
    OUTPUT_HEADERS = [
        "player_id", "プレイヤー", "リーグ", "収支", "bb_size", "ハンド数",
        "VPIP", "VPIP_hands", "PFR", "PFR_hands", "3bet", "3bet_hands",
        "Fold to 3bet", "Fold to 3bet_hands", "CB", "CB_hands",
        "WTSD", "WTSD_hands", "W$SD", "W$SD_hands"
    ]

    def __init__(self,
                 chips_csv: str = "data/preseason/preseason_chips.csv",
                 stats_csv: str = "data/preseason/preseason_stats.csv",
                 players_json: str = "config/players.json",
                 bb_size: int = 20):
        self.chips_csv = Path(chips_csv)
        self.stats_csv = Path(stats_csv)
        self.players_json = Path(players_json)
        self.bb_size = bb_size
        self.players_map = self._load_players_map()

    def _load_players_map(self) -> Dict[str, str]:
        """players.jsonからプレイヤー名→canonical IDのマップを作成"""
        try:
            with open(self.players_json, "r", encoding="utf-8") as f:
                data = json.load(f)

            name_to_id = {}
            for canonical_id, info in data["players"].items():
                display_name = info["display_name"]
                name_to_id[display_name] = canonical_id

            return name_to_id
        except Exception as e:
            print(f"Warning: Could not load players.json: {e}")
            return {}

    def _parse_stat_value(self, value_str: str) -> Tuple[Optional[float], Optional[int]]:
        """
        スタッツ値を解析: "29.34 [7320]" -> (29.34, 7320)

        Returns:
            (stat_value, hands): スタッツ値とハンド数のタプル
        """
        value_str = value_str.strip()

        # #DIV/0! や空文字の場合
        if not value_str or "#DIV/0!" in value_str:
            return (None, None)

        # パターン: "数値 [ハンド数]"
        match = re.match(r'([0-9.]+)\s*\[(\d+)\]', value_str)
        if match:
            stat_value = float(match.group(1))
            hands = int(match.group(2))
            return (stat_value, hands)

        # マッチしない場合
        return (None, None)

    def _parse_chips_value(self, value_str: str) -> Optional[int]:
        """
        収支を解析: "1850.65 BB" -> 37013 (chips)

        Returns:
            チップ数（整数）
        """
        value_str = value_str.strip()

        if not value_str or "#DIV/0!" in value_str:
            return None

        # パターン: "数値 BB"
        match = re.match(r'([+-]?[0-9.]+)\s*BB', value_str)
        if match:
            bb_value = float(match.group(1))
            chips = int(bb_value * self.bb_size)
            return chips

        return None

    def read_chips_data(self) -> Dict[str, Dict]:
        """
        preseason_chips.csvを読み込んで辞書形式で返す

        Returns:
            {プレイヤー名: {"net": 収支, "hands": ハンド数}}
        """
        chips_data = {}

        with open(self.chips_csv, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            rows = list(reader)

        # 1行目: プレイヤー名
        player_names = rows[0][1:]  # "player" を除く

        # 2行目: 収支 (total BB)
        total_values = rows[1][1:]

        # 3行目: ハンド数
        hands_values = rows[2][1:]

        for i, player_name in enumerate(player_names):
            net_chips = self._parse_chips_value(total_values[i])
            hands = int(hands_values[i]) if hands_values[i].isdigit() else 0

            chips_data[player_name] = {
                "net": net_chips if net_chips is not None else 0,
                "hands": hands
            }

        return chips_data

    def read_stats_data(self) -> Dict[str, Dict]:
        """
        preseason_stats.csvを読み込んで辞書形式で返す

        Returns:
            {プレイヤー名: {"VPIP": val, "VPIP_hands": hands, ...}}
        """
        stats_data = {}

        with open(self.stats_csv, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            rows = list(reader)

        # 1行目: プレイヤー名
        player_names = rows[0][1:]

        # スタッツ名のマッピング
        stat_names = ["VPIP", "PFR", "3bet", "Fold to 3bet", "CB", "WTSD", "W$SD"]

        # プレイヤーごとにデータを初期化
        for player_name in player_names:
            stats_data[player_name] = {}

        # 2行目以降: 各スタッツ
        for row_idx in range(1, len(rows)):
            stat_name = stat_names[row_idx - 1]
            stat_values = rows[row_idx][1:]

            for i, player_name in enumerate(player_names):
                value, hands = self._parse_stat_value(stat_values[i])
                stats_data[player_name][stat_name] = value if value is not None else 0.0
                stats_data[player_name][f"{stat_name}_hands"] = hands if hands is not None else 0

        return stats_data

    def merge_and_format(self) -> List[Dict]:
        """
        chipsとstatsのデータをマージして、目標フォーマットに変換

        Returns:
            変換後のデータ（辞書のリスト）
        """
        chips_data = self.read_chips_data()
        stats_data = self.read_stats_data()

        # プレイヤー名の集合（両方のCSVに存在するプレイヤー）
        all_players = set(chips_data.keys()) | set(stats_data.keys())

        formatted_data = []

        for player_name in all_players:
            # players.jsonからplayer_idを取得
            player_id = self.players_map.get(player_name, player_name)

            # chips data
            chips_info = chips_data.get(player_name, {"net": 0, "hands": 0})
            net = chips_info["net"]
            hands = chips_info["hands"]

            # stats data
            stats_info = stats_data.get(player_name, {})

            # 収支をフォーマット（+/- 付き）
            if net > 0:
                net_str = f"+{net}"
            else:
                net_str = str(net)

            # データを構築
            row_data = {
                "player_id": player_id,
                "プレイヤー": player_name,
                "リーグ": "C",  # デフォルトでCリーグ
                "収支": net_str,
                "bb_size": self.bb_size,  # preseasonのbb_size（デフォルト20）
                "ハンド数": hands,
                "VPIP": stats_info.get("VPIP", 0.0),
                "VPIP_hands": stats_info.get("VPIP_hands", 0),
                "PFR": stats_info.get("PFR", 0.0),
                "PFR_hands": stats_info.get("PFR_hands", 0),
                "3bet": stats_info.get("3bet", 0.0),
                "3bet_hands": stats_info.get("3bet_hands", 0),
                "Fold to 3bet": stats_info.get("Fold to 3bet", 0.0),
                "Fold to 3bet_hands": stats_info.get("Fold to 3bet_hands", 0),
                "CB": stats_info.get("CB", 0.0),
                "CB_hands": stats_info.get("CB_hands", 0),
                "WTSD": stats_info.get("WTSD", 0.0),
                "WTSD_hands": stats_info.get("WTSD_hands", 0),
                "W$SD": stats_info.get("W$SD", 0.0),
                "W$SD_hands": stats_info.get("W$SD_hands", 0),
            }

            formatted_data.append(row_data)

        # ハンド数でソート（降順）
        formatted_data.sort(key=lambda x: x["ハンド数"], reverse=True)

        return formatted_data

    def write_output(self, output_path: str, formatted_data: List[Dict]) -> None:
        """
        フォーマット済みデータをCSVに出力

        Args:
            output_path: 出力CSVファイルパス
            formatted_data: フォーマット済みデータ
        """
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)

            # ヘッダー
            writer.writerow(self.OUTPUT_HEADERS)

            # データ行
            for row_data in formatted_data:
                row = [row_data.get(header, "") for header in self.OUTPUT_HEADERS]
                writer.writerow(row)

        print(f"Written {len(formatted_data)} players to {output_path}")

    def run(self, output_path: str = "data/preseason_all_stats.csv") -> None:
        """
        メイン処理: データ変換とファイル出力

        Args:
            output_path: 出力ファイルパス
        """
        print("=== Preseason Data Formatter ===\n")

        print(f"Reading chips data from: {self.chips_csv}")
        print(f"Reading stats data from: {self.stats_csv}")
        print(f"Using players mapping from: {self.players_json}")
        print(f"BB size: {self.bb_size}\n")

        # データの読み込みとマージ
        formatted_data = self.merge_and_format()

        # CSVに出力
        self.write_output(output_path, formatted_data)

        print(f"\n=== Summary ===")
        print(f"Total players: {len(formatted_data)}")
        print(f"Output file: {output_path}")


if __name__ == "__main__":
    formatter = PreseasonFormatter(bb_size=20)
    formatter.run()
