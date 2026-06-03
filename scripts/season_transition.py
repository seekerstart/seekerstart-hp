#!/usr/bin/env python3
"""
シーズン移行スクリプト: シーズン結果を元に次シーズンのリーグ編成を決定する。

Usage:
    python scripts/season_transition.py --season 2 [--verbose]
"""

import argparse
import csv
import json
import sys
from pathlib import Path


LEAGUE_ORDER = ["A", "B", "C", "D"]


def load_config(config_dir: Path):
    with open(config_dir / "seasons.json", "r", encoding="utf-8-sig") as f:
        return json.load(f)


def load_players(config_dir: Path):
    with open(config_dir / "players.json", "r", encoding="utf-8-sig") as f:
        return json.load(f)


def get_display_name(player_id: str, players_config: dict, csv_names: dict) -> str:
    if player_id in players_config.get("players", {}):
        return players_config["players"][player_id].get("display_name", player_id)
    return csv_names.get(player_id, player_id)


def load_season_stats(data_dir: Path, season_id: int) -> list[dict]:
    csv_path = data_dir / f"season_{season_id}_stats.csv"
    if not csv_path.exists():
        print(f"Error: {csv_path} が見つかりません。先に main.py を実行してください。")
        sys.exit(1)

    rows = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            profit_str = row["収支"].replace("+", "")
            rows.append({
                "player_id": row["player_id"],
                "name": row["プレイヤー"],
                "league": row["リーグ"],
                "profit": float(profit_str),
                "hands": int(row["ハンド数"]),
            })
    return rows


def get_active_leagues(season_config: dict) -> list[str]:
    configured = set(season_config.get("leagues", {}).keys())
    return [l for l in LEAGUE_ORDER if l in configured]


def get_rule_count(rule: dict, total: int) -> int:
    if "top_count" in rule:
        return rule["top_count"]
    if "bottom_count" in rule:
        return rule["bottom_count"]
    if "top_percent" in rule:
        return round(total * rule["top_percent"])
    if "bottom_percent" in rule:
        return round(total * rule["bottom_percent"])
    return 0


def get_rule_label(rule: dict, total: int) -> str:
    if "top_count" in rule:
        return f"上位 {rule['top_count']}人"
    if "bottom_count" in rule:
        return f"下位 {rule['bottom_count']}人"
    if "top_percent" in rule:
        n = round(total * rule["top_percent"])
        return f"上位 {rule['top_percent']*100:.0f}% = {n}人"
    if "bottom_percent" in rule:
        n = round(total * rule["bottom_percent"])
        return f"下位 {rule['bottom_percent']*100:.0f}% = {n}人"
    return "なし"


def get_league_members(league_name: str, season_config: dict, stats: list[dict]) -> list[dict]:
    config_members = season_config.get("leagues", {}).get(league_name, [])
    stats_by_id = {s["player_id"]: s for s in stats}

    if "*" in config_members:
        explicit_ids = set()
        for name, members in season_config.get("leagues", {}).items():
            if "*" not in members:
                explicit_ids.update(members)
        return [s for s in stats if s["player_id"] not in explicit_ids]

    members = []
    for pid in config_members:
        if pid in stats_by_id:
            members.append(stats_by_id[pid])
        else:
            members.append({"player_id": pid, "name": pid, "league": league_name, "profit": 0, "hands": 0})
    return members


def compute_transitions(season_config: dict, stats: list[dict], verbose: bool = False):
    league_rules = season_config.get("league_rules", {})
    required_hands = league_rules.get("required_hands", 1000)
    promotion_rules = league_rules.get("promotion", {})
    relegation_rules = league_rules.get("relegation", {})
    leagues = get_active_leagues(season_config)

    transitions = {}

    for idx, league in enumerate(leagues):
        members = get_league_members(league, season_config, stats)
        sorted_members = sorted(members, key=lambda x: x["profit"], reverse=True)
        total = len(sorted_members)

        promote_to = leagues[idx - 1] if idx > 0 else None
        relegate_to = leagues[idx + 1] if idx < len(leagues) - 1 else None

        promo_key = f"{league}_to_{promote_to}" if promote_to else None
        releg_key = f"{league}_to_{relegate_to}" if relegate_to else None

        promo_rule = promotion_rules.get(promo_key, {}) if promo_key else {}
        releg_rule = relegation_rules.get(releg_key, {}) if releg_key else {}

        n_promote = get_rule_count(promo_rule, total) if promo_rule else 0
        n_relegate = get_rule_count(releg_rule, total) if releg_rule else 0

        if verbose:
            print(f"\n=== {league} リーグ ({total}人) ===")
            if promote_to:
                print(f"  昇格 → {promote_to}: {get_rule_label(promo_rule, total)}")
            if relegate_to:
                print(f"  降格 → {relegate_to}: {get_rule_label(releg_rule, total)}")
            print(f"  必要ハンド数: {required_hands}")
            print()

        for rank, p in enumerate(sorted_members, 1):
            pid = p["player_id"]

            if promote_to and rank <= n_promote and p["hands"] >= required_hands:
                transitions[pid] = {
                    "from": league, "to": promote_to,
                    "reason": f"昇格 (#{rank}/{total}) & {p['hands']}ハンド",
                }
            elif relegate_to and rank > total - n_relegate:
                transitions[pid] = {
                    "from": league, "to": relegate_to,
                    "reason": f"降格 (#{rank}/{total})",
                }
            elif relegate_to and p["hands"] < required_hands:
                transitions[pid] = {
                    "from": league, "to": relegate_to,
                    "reason": f"{required_hands}ハンド未満 ({p['hands']}ハンド)",
                }
            else:
                transitions[pid] = {
                    "from": league, "to": league,
                    "reason": f"残留 (#{rank}/{total}, {p['hands']}ハンド)",
                }

            if verbose:
                dest = transitions[pid]["to"]
                mark = "→" if transitions[pid]["from"] != dest else "　"
                print(f"  #{rank:2d} {p['name']:15s}  収支:{p['profit']:+10.1f}  {p['hands']:5d}H  {mark} {dest}  {transitions[pid]['reason']}")

    return transitions


def build_new_leagues(transitions: dict, active_leagues: list[str]) -> dict:
    lowest = active_leagues[-1]
    leagues = {l: [] for l in active_leagues}
    leagues[lowest] = ["*"]

    for pid, t in transitions.items():
        dest = t["to"]
        if dest != lowest:
            leagues[dest].append(pid)

    for l in active_leagues:
        if l != lowest:
            leagues[l].sort()
    return leagues


def print_summary(transitions: dict, players_config: dict, csv_names: dict, active_leagues: list[str]):
    print("\n" + "=" * 60)
    print("シーズン移行結果サマリー")
    print("=" * 60)

    for i, league in enumerate(active_leagues):
        if i > 0:
            lower = active_leagues[i]
            upper = active_leagues[i - 1]
            promoted = [(pid, t) for pid, t in transitions.items() if t["from"] == lower and t["to"] == upper]
            if promoted:
                print(f"\n▲ {lower} → {upper} 昇格 ({len(promoted)}人)")
                for pid, t in promoted:
                    print(f"  {get_display_name(pid, players_config, csv_names)}")

    for league in active_leagues:
        stayed = [(pid, t) for pid, t in transitions.items() if t["from"] == league and t["to"] == league]
        if stayed:
            print(f"\n● {league} 残留 ({len(stayed)}人)")
            for pid, t in stayed:
                print(f"  {get_display_name(pid, players_config, csv_names)}")

    for i in range(len(active_leagues) - 1):
        upper = active_leagues[i]
        lower = active_leagues[i + 1]
        relegated = [(pid, t) for pid, t in transitions.items() if t["from"] == upper and t["to"] == lower]
        if relegated:
            print(f"\n▼ {upper} → {lower} 降格 ({len(relegated)}人)")
            for pid, t in relegated:
                print(f"  {get_display_name(pid, players_config, csv_names)}  ({t['reason']})")

    print(f"\n--- 次シーズン人数 ---")
    for league in active_leagues:
        count = sum(1 for _, t in transitions.items() if t["to"] == league)
        suffix = " (+ ワイルドカード)" if league == active_leagues[-1] else ""
        print(f"  {league} リーグ: {count}人{suffix}")


def main():
    parser = argparse.ArgumentParser(description="シーズン移行: 昇格・降格を計算")
    parser.add_argument("--season", type=int, required=True, help="対象シーズン ID")
    parser.add_argument("--verbose", "-v", action="store_true", help="詳細なランキングを表示")
    args = parser.parse_args()

    base_dir = Path(__file__).parent.parent
    config_dir = base_dir / "config"
    data_dir = base_dir / "data"

    config = load_config(config_dir)
    players_config = load_players(config_dir)

    season_config = None
    for s in config["seasons"]:
        if s["id"] == args.season:
            season_config = s
            break

    if not season_config:
        print(f"Error: シーズン {args.season} が見つかりません")
        sys.exit(1)

    stats = load_season_stats(data_dir, args.season)
    csv_names = {s["player_id"]: s["name"] for s in stats}
    active_leagues = get_active_leagues(season_config)

    transitions = compute_transitions(season_config, stats, verbose=args.verbose)
    print_summary(transitions, players_config, csv_names, active_leagues)

    new_leagues = build_new_leagues(transitions, active_leagues)
    print("\n" + "=" * 60)
    print("次シーズン用 leagues 設定:")
    print("=" * 60)
    print(json.dumps(new_leagues, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
