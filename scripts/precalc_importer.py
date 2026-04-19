"""
計算済みスタッツ取り込みモジュール
Poker Now の player-stats-all-time-*.json を PlayerStats に変換する
"""

import json
from pathlib import Path
from typing import Dict, Optional

from hand_analysis import PlayerStats
from player_registry import PlayerRegistry


class PreCalcImporter:
    """計算済みスタッツを取り込むクラス"""

    def __init__(self, registry: PlayerRegistry):
        self.registry = registry

    def load_json(self, json_path: Path) -> dict:
        """JSONファイルを読み込む"""
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def convert_to_player_stats(self, player_data: dict) -> PlayerStats:
        """
        JSONのプレイヤーデータをPlayerStatsに変換する

        注意: JSONの命名とPlayerStatsの命名が逆の部分がある
        - JSON の xxx_hands = 分子（例: vpip_hands = VPIPした回数）
        - PlayerStats の xxx_hands = 分母（例: vpip_hands = VPIP判定対象ハンド数）
        - PlayerStats の xxx_count = 分子（例: vpip_count = VPIPした回数）
        """
        summary = player_data["summary"]
        stats = PlayerStats()

        stats.hands = summary["hands"]

        # VPIP: JSON vpip_hands(分子) → PlayerStats vpip_count
        stats.vpip_count = summary["vpip_hands"]
        stats.vpip_hands = summary["hands"]

        # PFR: JSON pfr_hands(分子) → PlayerStats pfr_count
        stats.pfr_count = summary["pfr_hands"]
        stats.pfr_hands = summary["hands"]

        # 3bet: JSON three_bet_hands(分子), three_bet_opp(分母)
        stats.three_bet_count = summary["three_bet_hands"]
        stats.three_bet_hands = summary["three_bet_opp"]

        # Fold to 3bet: JSON fold_to_three_bet_hands(分子), faced_three_bet_opp(分母)
        stats.fold_to_3bet_count = summary["fold_to_three_bet_hands"]
        stats.fold_to_3bet_hands = summary["faced_three_bet_opp"]

        # CB (flop): JSON cbet_flop_made(分子), cbet_flop_opp(分母)
        stats.cb_count = summary["cbet_flop_made"]
        stats.cb_hands = summary["cbet_flop_opp"]

        # WTSD: JSON went_showdown_hands(分子), saw_flop_hands(分母)
        stats.wtsd_count = summary["went_showdown_hands"]
        stats.wtsd_hands = summary["saw_flop_hands"]

        # W$SD: JSON won_showdown_hands(分子)
        # 分母は wtsd_count (= went_showdown_hands)
        stats.wdsd_count = summary["won_showdown_hands"]

        # 収支: cbb → BB変換
        stats.net = summary["net_cbb"] / 100

        return stats

    def resolve_player_id(self, player_data: dict) -> Optional[str]:
        """JSONのプレイヤーデータからカノニカルIDを解決する"""
        display_name = player_data["display_name"]
        uuid = player_data["user_id"]

        # まずUUIDでcanonical_idを検索
        canonical_id = self.registry.get_canonical_id(uuid)
        if canonical_id != uuid:
            return canonical_id

        # display_nameで検索
        canonical_id = self.registry.find_by_display_name(display_name)
        if canonical_id:
            # UUIDをエイリアスに登録
            self.registry.add_alias(canonical_id, uuid)
            return canonical_id

        # 新規プレイヤー（Noneを返す）
        return None

    def import_json(self, json_path: Path, season_id: int) -> Dict[str, PlayerStats]:
        """JSONファイルからスタッツを取り込む"""
        data = self.load_json(json_path)
        result = {}

        for player_data in data["players"]:
            if player_data.get("is_bot", False):
                continue

            stats = self.convert_to_player_stats(player_data)
            canonical_id = self.resolve_player_id(player_data)

            if canonical_id is None:
                # 新規プレイヤー: UUIDで登録
                uuid = player_data["user_id"]
                display_name = player_data["display_name"]
                self.registry.register_player(uuid, display_name)
                canonical_id = uuid

            stats.player_id = canonical_id
            stats.display_name = (
                self.registry.get_display_name(canonical_id)
                or player_data["display_name"]
            )

            result[canonical_id] = stats

        return result

    @staticmethod
    def compute_delta(
        current: Dict[str, PlayerStats],
        previous: Dict[str, PlayerStats],
    ) -> Dict[str, PlayerStats]:
        """2つの累積スナップショット間の差分を計算する"""
        delta = {}

        for player_id, curr in current.items():
            if player_id in previous:
                prev = previous[player_id]
                d = PlayerStats(
                    player_id=curr.player_id,
                    display_name=curr.display_name,
                    league=curr.league,
                )
                d.hands = curr.hands - prev.hands
                d.net = curr.net - prev.net
                d.vpip_count = curr.vpip_count - prev.vpip_count
                d.vpip_hands = curr.vpip_hands - prev.vpip_hands
                d.pfr_count = curr.pfr_count - prev.pfr_count
                d.pfr_hands = curr.pfr_hands - prev.pfr_hands
                d.three_bet_count = curr.three_bet_count - prev.three_bet_count
                d.three_bet_hands = curr.three_bet_hands - prev.three_bet_hands
                d.fold_to_3bet_count = curr.fold_to_3bet_count - prev.fold_to_3bet_count
                d.fold_to_3bet_hands = curr.fold_to_3bet_hands - prev.fold_to_3bet_hands
                d.cb_count = curr.cb_count - prev.cb_count
                d.cb_hands = curr.cb_hands - prev.cb_hands
                d.wtsd_count = curr.wtsd_count - prev.wtsd_count
                d.wtsd_hands = curr.wtsd_hands - prev.wtsd_hands
                d.wdsd_count = curr.wdsd_count - prev.wdsd_count

                # ハンド数が増えていれば参加したとみなす
                if d.hands > 0:
                    delta[player_id] = d
            else:
                # このセッションで新たに参加したプレイヤー
                d = PlayerStats(
                    player_id=curr.player_id,
                    display_name=curr.display_name,
                    league=curr.league,
                )
                d.merge(curr)
                delta[player_id] = d

        return delta
