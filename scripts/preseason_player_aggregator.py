"""
Preseasonプレイヤー集約スクリプト
preseasonディレクトリから全プレイヤーのIDを集約してplayers.jsonに統合
1つのプレイヤー名に複数のIDが対応する場合に対応
"""

import re
import json
from pathlib import Path
from typing import Dict, Set
from collections import defaultdict


class PreseasonPlayerAggregator:
    """Preseasonプレイヤー集約クラス"""

    def __init__(self, preseason_dir: str = "data/hand_histories/preseason",
                 players_json_path: str = "config/players.json"):
        self.preseason_dir = Path(preseason_dir)
        self.players_json_path = Path(players_json_path)
        # プレイヤー名 -> IDのセット
        self.player_name_to_ids: Dict[str, Set[str]] = defaultdict(set)

    def discover_csv_files(self) -> list:
        """preseasonディレクトリ内の全poker_now_log_*.csvファイルを検出"""
        csv_files = []
        if not self.preseason_dir.exists():
            print(f"Warning: {self.preseason_dir} does not exist")
            return csv_files

        # poker_now_log_*.csvファイルを再帰的に検索
        csv_files = list(self.preseason_dir.glob("**/poker_now_log_*.csv"))
        return csv_files

    def extract_player_mappings(self, csv_path: Path) -> Dict[str, str]:
        """
        CSVファイルからプレイヤー名とIDのマッピングを抽出

        Returns:
            Dict[str, str]: {プレイヤー名: プレイヤーID}の辞書（複数IDある場合は最後のもの）
        """
        try:
            with open(csv_path, "r", encoding="utf-8") as f:
                raw_text = f.read()

            # "name @ id" パターンを抽出
            name_id_pairs = re.findall(r'"(.*?) @ ([^"]+)"', raw_text)

            # 同じ名前に対して複数のIDが存在する可能性があるため、すべてを収集
            mappings = {}
            for name, player_id in name_id_pairs:
                mappings[name] = player_id  # 最後に見つかったものを保持（後で全IDを集約）

            return mappings

        except Exception as e:
            print(f"Error reading {csv_path}: {e}")
            return {}

    def aggregate_all_players(self, csv_files: list) -> None:
        """全CSVファイルからプレイヤー情報を集約"""
        for csv_path in csv_files:
            print(f"Processing: {csv_path}")

            try:
                with open(csv_path, "r", encoding="utf-8") as f:
                    raw_text = f.read()

                # CSVでは""でエスケープされたプレイヤー名とIDのペアを抽出
                # パターン: ""プレイヤー名 @ プレイヤーID""
                # プレイヤーIDは英数字、アンダースコア、ハイフンのみ
                # プレイヤー名は改行を含まず、40文字以内
                name_id_pairs = re.findall(r'""([^"\n]+) @ ([a-zA-Z0-9_-]+)""', raw_text)

                # プレイヤー名ごとにIDを集約（不正なエントリをフィルタリング）
                for name, player_id in name_id_pairs:
                    # プレイヤー名から余計な空白を削除
                    name = name.strip()

                    # 不正なパターンをフィルタリング
                    if not name or not player_id:
                        continue
                    if len(name) > 40:
                        continue
                    if 'starting hand' in name:
                        continue
                    if 'id:' in name:
                        continue
                    if 'dealer:' in name:
                        continue
                    if 'Texas Hold' in name:
                        continue
                    if 'Uncalled' in name:
                        continue
                    if 'Player stacks' in name:
                        continue

                    self.player_name_to_ids[name].add(player_id)

            except Exception as e:
                print(f"Error processing {csv_path}: {e}")

    def load_existing_players(self) -> dict:
        """既存のplayers.jsonを読み込む"""
        if self.players_json_path.exists():
            try:
                with open(self.players_json_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading {self.players_json_path}: {e}")
                return {"players": {}, "id_changes": []}
        else:
            return {"players": {}, "id_changes": []}

    def merge_into_players_json(self) -> dict:
        """
        集約したプレイヤー情報を既存のplayers.jsonに統合

        戦略:
        - 既存プレイヤー（IDが一致）の場合: display_nameは保持し、aliasesのみ追加
        - 既存プレイヤー（display_nameが一致）の場合: aliasesのみ追加
        - 新規プレイヤーの場合: 最初のIDをcanonical IDとして新規エントリを作成
        """
        players_data = self.load_existing_players()

        # 既存のIDからcanonical IDへのマッピングを作成
        id_to_canonical = {}
        for canonical_id, info in players_data["players"].items():
            for alias_id in info.get("aliases", []):
                id_to_canonical[alias_id] = canonical_id

        for player_name, id_set in self.player_name_to_ids.items():
            id_list = sorted(list(id_set))

            # まず、いずれかのIDが既存プレイヤーのaliasに含まれているかチェック
            existing_canonical_id = None
            for pid in id_list:
                if pid in id_to_canonical:
                    existing_canonical_id = id_to_canonical[pid]
                    break

            # 既存プレイヤーが見つからない場合、display_nameで検索
            if not existing_canonical_id:
                for canonical_id, info in players_data["players"].items():
                    if info["display_name"] == player_name:
                        existing_canonical_id = canonical_id
                        break

            if existing_canonical_id:
                # 既存プレイヤー: aliasesに新しいIDのみを追加（display_nameは保持）
                existing_aliases = set(players_data["players"][existing_canonical_id].get("aliases", []))
                new_ids = id_set - existing_aliases
                if new_ids:
                    existing_aliases.update(id_list)
                    players_data["players"][existing_canonical_id]["aliases"] = sorted(list(existing_aliases))
                    # ID to canonical mapping を更新
                    for new_id in new_ids:
                        id_to_canonical[new_id] = existing_canonical_id
                    print(f"Updated existing player: {players_data['players'][existing_canonical_id]['display_name']} (added {len(new_ids)} new IDs, total {len(existing_aliases)} IDs)")
            else:
                # 新規プレイヤー: 最初のIDをcanonical IDとして使用
                canonical_id = id_list[0]
                players_data["players"][canonical_id] = {
                    "display_name": player_name,
                    "aliases": id_list
                }
                for pid in id_list:
                    id_to_canonical[pid] = canonical_id
                print(f"Added new player: {player_name} with {len(id_list)} IDs")

        return players_data

    def save_players_json(self, players_data: dict) -> None:
        """players.jsonを保存"""
        try:
            with open(self.players_json_path, "w", encoding="utf-8") as f:
                json.dump(players_data, f, ensure_ascii=False, indent=2)
            print(f"\nSaved to {self.players_json_path}")
        except Exception as e:
            print(f"Error saving {self.players_json_path}: {e}")

    def run(self) -> None:
        """メイン処理"""
        print("=== Preseason Player Aggregation ===\n")

        # CSVファイルを検出
        csv_files = self.discover_csv_files()
        print(f"Found {len(csv_files)} CSV files\n")

        if not csv_files:
            print("No CSV files found. Exiting.")
            return

        # プレイヤー情報を集約
        self.aggregate_all_players(csv_files)
        print(f"\nAggregated {len(self.player_name_to_ids)} unique players")

        # プレイヤー名ごとのID数を表示
        print("\n=== Player ID Summary ===")
        for player_name, id_set in sorted(self.player_name_to_ids.items()):
            if len(id_set) > 1:
                print(f"  {player_name}: {len(id_set)} IDs")

        # players.jsonに統合
        print("\n=== Merging into players.json ===")
        players_data = self.merge_into_players_json()

        # 保存
        self.save_players_json(players_data)

        # サマリー
        print("\n=== Summary ===")
        print(f"Total players in players.json: {len(players_data['players'])}")
        print(f"Total ID changes recorded: {len(players_data.get('id_changes', []))}")


if __name__ == "__main__":
    aggregator = PreseasonPlayerAggregator()
    aggregator.run()
