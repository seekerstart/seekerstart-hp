"""
プレイヤーID管理モジュール
プレイヤーIDの登録、エイリアス管理、ID変更検出を行う
"""

import re
from typing import Optional
from config_loader import ConfigLoader


class PlayerRegistry:
    """プレイヤーID管理クラス"""

    # ID変更検出用の正規表現パターン
    ID_CHANGE_PATTERN = re.compile(
        r'The player "(.+?) @ (\w+)" changed the ID from (\w+) to (\w+)'
    )

    def __init__(self, config_loader: ConfigLoader):
        self.config = config_loader
        self._players_data = None
        self._modified = False

    def _load(self) -> dict:
        """プレイヤーデータを読み込む（キャッシュ）"""
        if self._players_data is None:
            self._players_data = self.config.load_players()
        return self._players_data

    def save(self) -> None:
        """変更があった場合のみ保存する"""
        if self._modified and self._players_data is not None:
            self.config.save_players(self._players_data)
            self._modified = False

    def get_display_name(self, player_id: str) -> Optional[str]:
        """プレイヤーIDから表示名を取得する"""
        data = self._load()
        # 直接IDで検索
        if player_id in data["players"]:
            return data["players"][player_id]["display_name"]
        # エイリアスで検索
        for pid, info in data["players"].items():
            if player_id in info.get("aliases", []):
                return info["display_name"]
        return None

    def get_canonical_id(self, player_id: str) -> str:
        """エイリアスからカノニカルIDを取得する"""
        data = self._load()
        # 直接IDの場合
        if player_id in data["players"]:
            return player_id
        # エイリアスで検索
        for pid, info in data["players"].items():
            if player_id in info.get("aliases", []):
                return pid
        return player_id

    def register_player(self, player_id: str, display_name: str) -> None:
        """新規プレイヤーを登録する"""
        data = self._load()
        if player_id not in data["players"]:
            # エイリアスにも存在しないか確認
            if self.get_canonical_id(player_id) == player_id:
                data["players"][player_id] = {
                    "display_name": display_name,
                    "aliases": [player_id]
                }
                self._modified = True

    def register_id_change(self, old_id: str, new_id: str, display_name: str) -> None:
        """ID変更を登録する（エイリアスに追加）"""
        data = self._load()
        canonical_id = self.get_canonical_id(old_id)

        if canonical_id in data["players"]:
            # 既存プレイヤー: エイリアスに新IDを追加
            if new_id not in data["players"][canonical_id]["aliases"]:
                data["players"][canonical_id]["aliases"].append(new_id)
                self._modified = True
            # id_changesにも記録
            change_record = {
                "old_id": old_id,
                "new_id": new_id,
                "display_name": display_name
            }
            if change_record not in data["id_changes"]:
                data["id_changes"].append(change_record)
                self._modified = True
        else:
            # 新規プレイヤー（old_idが見つからない場合）
            # new_idで登録し、old_idをエイリアスに追加
            data["players"][new_id] = {
                "display_name": display_name,
                "aliases": [old_id, new_id]
            }
            self._modified = True

    def detect_id_changes(self, log_text: str) -> list:
        """ログテキストからID変更を検出する"""
        changes = []
        for match in self.ID_CHANGE_PATTERN.finditer(log_text):
            display_name, new_id, old_id, new_id2 = match.groups()
            # new_id と new_id2 が一致していることを確認
            if new_id == new_id2:
                changes.append({
                    "display_name": display_name,
                    "old_id": old_id,
                    "new_id": new_id
                })
        return changes

    def process_id_changes(self, log_text: str) -> list:
        """ログからID変更を検出して登録する"""
        changes = self.detect_id_changes(log_text)
        for change in changes:
            self.register_id_change(
                change["old_id"],
                change["new_id"],
                change["display_name"]
            )
        return changes

    def get_all_player_ids(self) -> list:
        """全プレイヤーのカノニカルIDリストを取得"""
        data = self._load()
        return list(data["players"].keys())

    def get_all_players(self) -> dict:
        """全プレイヤーデータを取得"""
        return self._load()["players"]


if __name__ == "__main__":
    # テスト用
    loader = ConfigLoader()
    registry = PlayerRegistry(loader)

    # テストログ
    test_log = '''The player "TestPlayer @ abc123" changed the ID from xyz789 to abc123 because authenticated login'''

    changes = registry.detect_id_changes(test_log)
    print("Detected changes:", changes)
