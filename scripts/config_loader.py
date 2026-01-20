"""
設定ファイル読み込みモジュール
seasons.json と players.json を読み込んで管理する
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Optional


class ConfigLoader:
    """設定ファイルを読み込むクラス"""

    def __init__(self, config_dir: str = "config"):
        self.config_dir = Path(config_dir)
        self._seasons_data = None
        self._players_data = None

    @property
    def seasons_path(self) -> Path:
        return self.config_dir / "seasons.json"

    @property
    def players_path(self) -> Path:
        return self.config_dir / "players.json"

    def load_seasons(self) -> dict:
        """seasons.json を読み込む"""
        if self._seasons_data is None:
            with open(self.seasons_path, "r", encoding="utf-8") as f:
                self._seasons_data = json.load(f)
        return self._seasons_data

    def load_players(self) -> dict:
        """players.json を読み込む"""
        if self._players_data is None:
            with open(self.players_path, "r", encoding="utf-8") as f:
                self._players_data = json.load(f)
        return self._players_data

    def save_players(self, data: dict) -> None:
        """players.json を保存する"""
        with open(self.players_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        self._players_data = data

    def get_season_by_date(self, date: datetime) -> Optional[dict]:
        """指定日付が属するシーズンを取得する"""
        seasons_data = self.load_seasons()
        for season in seasons_data["seasons"]:
            start = datetime.strptime(season["start_date"], "%Y-%m-%d")
            end = datetime.strptime(season["end_date"], "%Y-%m-%d")
            if start <= date <= end:
                return season
        return None

    def get_current_season(self) -> Optional[dict]:
        """現在アクティブなシーズンを取得する"""
        seasons_data = self.load_seasons()
        current_id = seasons_data.get("current_season_id")
        for season in seasons_data["seasons"]:
            if season["id"] == current_id:
                return season
        return None

    def get_season_by_id(self, season_id: int) -> Optional[dict]:
        """指定IDのシーズンを取得する"""
        seasons_data = self.load_seasons()
        for season in seasons_data["seasons"]:
            if season["id"] == season_id:
                return season
        return None

    def get_all_seasons(self) -> list:
        """全シーズンのリストを取得する"""
        seasons_data = self.load_seasons()
        return seasons_data["seasons"]

    def get_player_league(self, player_id: str, season: dict) -> str:
        """プレイヤーのリーグを取得する（デフォルトはC）"""
        leagues = season.get("leagues", {})
        for league_name, members in leagues.items():
            if player_id in members:
                return league_name
        # ワイルドカード "*" がある場合、そのリーグをデフォルトとする
        for league_name, members in leagues.items():
            if "*" in members:
                return league_name
        return "C"  # フォールバック


if __name__ == "__main__":
    # テスト用
    loader = ConfigLoader()
    print("Seasons:", loader.load_seasons())
    print("Players:", loader.load_players())
    print("Current season:", loader.get_current_season())
