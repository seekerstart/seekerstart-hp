#!/usr/bin/env python3
"""
Neon DB からプレイヤースタッツを取得し、
fast-table の /admin/stats/export と同じ JSON フォーマットで出力する。

Usage:
    DATABASE_URL=postgresql://... python scripts/fetch_stats.py --data-dir data [--date YYYYMMDD] [--verbose] [--dry-run]
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Error: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)


# fast-table のデフォルト設定: BB_UNIT=0.01 → cbbPerBb=100
CBB_PER_BB = 100


def safe_pct(numerator, denominator, decimals=1):
    """ゼロ除算を回避してパーセンテージを計算する"""
    if not denominator:
        return 0
    return round((numerator / denominator) * 100, decimals)


def build_summary(stats):
    """fast-table の buildStatsSummary と同等の計算"""
    hands = stats["hands"] or 0

    vpip_pct = safe_pct(stats["vpip_hands"], hands)
    pfr_pct = safe_pct(stats["pfr_hands"], hands)
    three_bet_pct = safe_pct(stats["three_bet_hands"], stats["three_bet_opp"])
    four_bet_pct = safe_pct(stats["four_bet_hands"], stats["four_bet_opp"])
    fold_to_three_bet_pct = safe_pct(stats["fold_to_three_bet_hands"], stats["faced_three_bet_opp"])
    fold_to_four_bet_pct = safe_pct(stats["fold_to_four_bet_hands"], stats["faced_four_bet_opp"])
    cbet_flop_pct = safe_pct(stats["cbet_flop_made"], stats["cbet_flop_opp"])
    cbet_turn_pct = safe_pct(stats["cbet_turn_made"], stats["cbet_turn_opp"])
    cbet_river_pct = safe_pct(stats["cbet_river_made"], stats["cbet_river_opp"])
    fold_to_cbet_flop_pct = safe_pct(stats["fold_to_cbet_flop"], stats["fold_to_cbet_flop_opp"])
    fold_to_cbet_turn_pct = safe_pct(stats["fold_to_cbet_turn"], stats["fold_to_cbet_turn_opp"])
    fold_to_cbet_river_pct = safe_pct(stats["fold_to_cbet_river"], stats["fold_to_cbet_river_opp"])

    agg_raise = stats["agg_raise"]
    agg_call = stats["agg_call"]
    agg_check = stats["agg_check"]

    if agg_call > 0:
        aggression = f"{agg_raise / agg_call:.2f}"
    elif agg_raise > 0:
        aggression = "99.00"
    else:
        aggression = "0.00"

    agg_freq_den = agg_raise + agg_call + agg_check
    aggression_freq_pct = safe_pct(agg_raise, agg_freq_den)

    wtsd_pct = safe_pct(stats["went_showdown_hands"], stats["saw_flop_hands"])
    wsd_pct = safe_pct(stats["won_showdown_hands"], stats["went_showdown_hands"])
    wwsf_pct = safe_pct(stats["won_when_saw_flop_hands"], stats["saw_flop_hands"])

    bb_per_100 = f"{(stats['net_cbb'] / CBB_PER_BB / hands * 100):.2f}" if hands else "0.00"

    return {
        "hands": hands,
        "vpip_pct": vpip_pct,
        "pfr_pct": pfr_pct,
        "three_bet_pct": three_bet_pct,
        "four_bet_pct": four_bet_pct,
        "fold_to_three_bet_pct": fold_to_three_bet_pct,
        "fold_to_four_bet_pct": fold_to_four_bet_pct,
        "cbet_flop_pct": cbet_flop_pct,
        "cbet_turn_pct": cbet_turn_pct,
        "cbet_river_pct": cbet_river_pct,
        "fold_to_cbet_flop_pct": fold_to_cbet_flop_pct,
        "fold_to_cbet_turn_pct": fold_to_cbet_turn_pct,
        "fold_to_cbet_river_pct": fold_to_cbet_river_pct,
        "vpip_hands": stats["vpip_hands"],
        "pfr_hands": stats["pfr_hands"],
        "three_bet_hands": stats["three_bet_hands"],
        "three_bet_opp": stats["three_bet_opp"],
        "four_bet_hands": stats["four_bet_hands"],
        "four_bet_opp": stats["four_bet_opp"],
        "fold_to_three_bet_hands": stats["fold_to_three_bet_hands"],
        "faced_three_bet_opp": stats["faced_three_bet_opp"],
        "fold_to_four_bet_hands": stats["fold_to_four_bet_hands"],
        "faced_four_bet_opp": stats["faced_four_bet_opp"],
        "cbet_flop_made": stats["cbet_flop_made"],
        "cbet_flop_opp": stats["cbet_flop_opp"],
        "cbet_turn_made": stats["cbet_turn_made"],
        "cbet_turn_opp": stats["cbet_turn_opp"],
        "cbet_river_made": stats["cbet_river_made"],
        "cbet_river_opp": stats["cbet_river_opp"],
        "fold_to_cbet_flop": stats["fold_to_cbet_flop"],
        "fold_to_cbet_flop_opp": stats["fold_to_cbet_flop_opp"],
        "fold_to_cbet_turn": stats["fold_to_cbet_turn"],
        "fold_to_cbet_turn_opp": stats["fold_to_cbet_turn_opp"],
        "fold_to_cbet_river": stats["fold_to_cbet_river"],
        "fold_to_cbet_river_opp": stats["fold_to_cbet_river_opp"],
        "agg_raise": agg_raise,
        "agg_call": agg_call,
        "agg_check": agg_check,
        "saw_flop_hands": stats["saw_flop_hands"],
        "went_showdown_hands": stats["went_showdown_hands"],
        "won_showdown_hands": stats["won_showdown_hands"],
        "won_when_saw_flop_hands": stats["won_when_saw_flop_hands"],
        "aggression": aggression,
        "aggression_freq_pct": aggression_freq_pct,
        "wtsd_pct": wtsd_pct,
        "wsd_pct": wsd_pct,
        "wwsf_pct": wwsf_pct,
        "bb_per_100": bb_per_100,
        "net_cbb": stats["net_cbb"],
        "showdown_cbb": stats["showdown_cbb"],
        "non_showdown_cbb": stats["non_showdown_cbb"],
    }


def build_metrics(stats, summary):
    """fast-table の buildStatsExportPlayer の metrics 部分"""
    agg_freq_den = stats["agg_raise"] + stats["agg_call"] + stats["agg_check"]
    return {
        "vpip": {"pct": summary["vpip_pct"], "numerator": stats["vpip_hands"], "denominator": stats["hands"]},
        "pfr": {"pct": summary["pfr_pct"], "numerator": stats["pfr_hands"], "denominator": stats["hands"]},
        "three_bet": {"pct": summary["three_bet_pct"], "numerator": stats["three_bet_hands"], "denominator": stats["three_bet_opp"]},
        "four_bet": {"pct": summary["four_bet_pct"], "numerator": stats["four_bet_hands"], "denominator": stats["four_bet_opp"]},
        "fold_to_three_bet": {"pct": summary["fold_to_three_bet_pct"], "numerator": stats["fold_to_three_bet_hands"], "denominator": stats["faced_three_bet_opp"]},
        "fold_to_four_bet": {"pct": summary["fold_to_four_bet_pct"], "numerator": stats["fold_to_four_bet_hands"], "denominator": stats["faced_four_bet_opp"]},
        "cbet_flop": {"pct": summary["cbet_flop_pct"], "numerator": stats["cbet_flop_made"], "denominator": stats["cbet_flop_opp"]},
        "cbet_turn": {"pct": summary["cbet_turn_pct"], "numerator": stats["cbet_turn_made"], "denominator": stats["cbet_turn_opp"]},
        "cbet_river": {"pct": summary["cbet_river_pct"], "numerator": stats["cbet_river_made"], "denominator": stats["cbet_river_opp"]},
        "fold_to_cbet_flop": {"pct": summary["fold_to_cbet_flop_pct"], "numerator": stats["fold_to_cbet_flop"], "denominator": stats["fold_to_cbet_flop_opp"]},
        "fold_to_cbet_turn": {"pct": summary["fold_to_cbet_turn_pct"], "numerator": stats["fold_to_cbet_turn"], "denominator": stats["fold_to_cbet_turn_opp"]},
        "fold_to_cbet_river": {"pct": summary["fold_to_cbet_river_pct"], "numerator": stats["fold_to_cbet_river"], "denominator": stats["fold_to_cbet_river_opp"]},
        "aggression": {"value": summary["aggression"], "numerator": stats["agg_raise"], "denominator": stats["agg_call"]},
        "aggression_frequency": {"pct": summary["aggression_freq_pct"], "numerator": stats["agg_raise"], "denominator": agg_freq_den},
        "wtsd": {"pct": summary["wtsd_pct"], "numerator": stats["went_showdown_hands"], "denominator": stats["saw_flop_hands"]},
        "wsd": {"pct": summary["wsd_pct"], "numerator": stats["won_showdown_hands"], "denominator": stats["went_showdown_hands"]},
        "wwsf": {"pct": summary["wwsf_pct"], "numerator": stats["won_when_saw_flop_hands"], "denominator": stats["saw_flop_hands"]},
        "bb_per_100": {"value": float(summary["bb_per_100"]), "numerator": stats["net_cbb"], "denominator": stats["hands"]},
        "net": {"cbb": stats["net_cbb"]},
        "showdown": {"cbb": stats["showdown_cbb"]},
        "non_showdown": {"cbb": stats["non_showdown_cbb"]},
    }


def build_raw_totals(stats):
    """fast-table の buildStatsExportPlayer の raw_totals 部分"""
    return {
        "hands": stats["hands"],
        "vpip_hands": stats["vpip_hands"],
        "pfr_hands": stats["pfr_hands"],
        "three_bet_hands": stats["three_bet_hands"],
        "three_bet_opp": stats["three_bet_opp"],
        "four_bet_hands": stats["four_bet_hands"],
        "four_bet_opp": stats["four_bet_opp"],
        "fold_to_three_bet_hands": stats["fold_to_three_bet_hands"],
        "faced_three_bet_opp": stats["faced_three_bet_opp"],
        "fold_to_four_bet_hands": stats["fold_to_four_bet_hands"],
        "faced_four_bet_opp": stats["faced_four_bet_opp"],
        "cbet_flop_made": stats["cbet_flop_made"],
        "cbet_flop_opp": stats["cbet_flop_opp"],
        "cbet_turn_made": stats["cbet_turn_made"],
        "cbet_turn_opp": stats["cbet_turn_opp"],
        "cbet_river_made": stats["cbet_river_made"],
        "cbet_river_opp": stats["cbet_river_opp"],
        "fold_to_cbet_flop": stats["fold_to_cbet_flop"],
        "fold_to_cbet_flop_opp": stats["fold_to_cbet_flop_opp"],
        "fold_to_cbet_turn": stats["fold_to_cbet_turn"],
        "fold_to_cbet_turn_opp": stats["fold_to_cbet_turn_opp"],
        "fold_to_cbet_river": stats["fold_to_cbet_river"],
        "fold_to_cbet_river_opp": stats["fold_to_cbet_river_opp"],
        "agg_raise": stats["agg_raise"],
        "agg_call": stats["agg_call"],
        "agg_check": stats["agg_check"],
        "saw_flop_hands": stats["saw_flop_hands"],
        "went_showdown_hands": stats["went_showdown_hands"],
        "won_showdown_hands": stats["won_showdown_hands"],
        "won_when_saw_flop_hands": stats["won_when_saw_flop_hands"],
        "net_cbb": stats["net_cbb"],
        "showdown_cbb": stats["showdown_cbb"],
        "non_showdown_cbb": stats["non_showdown_cbb"],
    }


def fetch_participants(conn):
    """hand_players + users + hands を JOIN してプレイ実績のある参加者一覧を取得"""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT DISTINCT hp.user_id::text,
                   u.display_name,
                   CASE WHEN u.is_bot THEN NULL ELSE u.discord_id END AS discord_id,
                   u.is_bot
            FROM hand_players hp
            JOIN users u ON u.id = hp.user_id
            JOIN hands h ON h.id = hp.hand_id
            WHERE h.status = 'completed'
            ORDER BY u.display_name, hp.user_id::text
        """)
        return cur.fetchall()


def fetch_player_stats(conn, user_ids):
    """player_stats テーブルから全スタッツを取得"""
    if not user_ids:
        return {}

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT user_id::text,
                   hands, vpip_hands, pfr_hands,
                   three_bet_hands, three_bet_opp,
                   four_bet_hands, four_bet_opp,
                   fold_to_three_bet_hands, faced_three_bet_opp,
                   fold_to_four_bet_hands, faced_four_bet_opp,
                   cbet_flop_made, cbet_flop_opp,
                   cbet_turn_made, cbet_turn_opp,
                   cbet_river_made, cbet_river_opp,
                   fold_to_cbet_flop, fold_to_cbet_flop_opp,
                   fold_to_cbet_turn, fold_to_cbet_turn_opp,
                   fold_to_cbet_river, fold_to_cbet_river_opp,
                   agg_raise, agg_call, agg_check,
                   saw_flop_hands, went_showdown_hands,
                   won_showdown_hands, won_when_saw_flop_hands,
                   net_cbb, showdown_cbb, non_showdown_cbb
            FROM player_stats
            WHERE user_id = ANY(%s::uuid[])
        """, (user_ids,))
        rows = cur.fetchall()

    stats_by_user = {}
    for row in rows:
        uid = row["user_id"]
        stats_by_user[uid] = {k: int(v) if v is not None else 0 for k, v in row.items() if k != "user_id"}
    return stats_by_user


def build_export_player(participant, stats):
    """fast-table の buildStatsExportPlayer と同等"""
    summary = build_summary(stats)
    metrics = build_metrics(stats, summary)
    raw_totals = build_raw_totals(stats)

    return {
        "user_id": participant["user_id"],
        "display_name": participant["display_name"],
        "discord_id": participant.get("discord_id"),
        "discord_username": None,
        "discord_global_name": None,
        "is_bot": participant["is_bot"],
        "summary": summary,
        "metrics": metrics,
        "raw_totals": raw_totals,
    }


EMPTY_STATS = {
    "hands": 0, "vpip_hands": 0, "pfr_hands": 0,
    "three_bet_hands": 0, "three_bet_opp": 0,
    "four_bet_hands": 0, "four_bet_opp": 0,
    "fold_to_three_bet_hands": 0, "faced_three_bet_opp": 0,
    "fold_to_four_bet_hands": 0, "faced_four_bet_opp": 0,
    "cbet_flop_made": 0, "cbet_flop_opp": 0,
    "cbet_turn_made": 0, "cbet_turn_opp": 0,
    "cbet_river_made": 0, "cbet_river_opp": 0,
    "fold_to_cbet_flop": 0, "fold_to_cbet_flop_opp": 0,
    "fold_to_cbet_turn": 0, "fold_to_cbet_turn_opp": 0,
    "fold_to_cbet_river": 0, "fold_to_cbet_river_opp": 0,
    "agg_raise": 0, "agg_call": 0, "agg_check": 0,
    "saw_flop_hands": 0, "went_showdown_hands": 0,
    "won_showdown_hands": 0, "won_when_saw_flop_hands": 0,
    "net_cbb": 0, "showdown_cbb": 0, "non_showdown_cbb": 0,
}


def main():
    parser = argparse.ArgumentParser(
        description="Neon DB からスタッツを取得し player-stats JSON を生成"
    )
    parser.add_argument(
        "--data-dir", default="data",
        help="データディレクトリのパス (default: data)"
    )
    parser.add_argument(
        "--date", default=None,
        help="セッション日付 YYYYMMDD (default: 当日)"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="詳細な出力を表示"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="実際にファイルを書き込まない"
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL environment variable is required")
        sys.exit(1)

    # 日付の決定
    if args.date:
        date_str = args.date
    else:
        date_str = datetime.now().strftime("%Y%m%d")

    base_dir = Path(__file__).parent.parent
    data_dir = base_dir / args.data_dir

    if args.verbose:
        print(f"Database URL: {database_url[:30]}...")
        print(f"Data directory: {data_dir}")
        print(f"Session date: {date_str}")

    # DB 接続
    try:
        conn = psycopg2.connect(database_url)
    except Exception as e:
        print(f"Error: Failed to connect to database: {e}")
        sys.exit(1)

    try:
        # 参加者を取得
        participants = fetch_participants(conn)
        if args.verbose:
            print(f"Found {len(participants)} participants")

        # user_id リスト
        user_ids = [p["user_id"] for p in participants]

        # スタッツ取得
        stats_by_user = fetch_player_stats(conn, user_ids)
        if args.verbose:
            print(f"Loaded stats for {len(stats_by_user)} players")

        # JSON 構築
        now = datetime.now(timezone.utc)
        players = []
        for participant in participants:
            uid = participant["user_id"]
            stats = stats_by_user.get(uid, EMPTY_STATS.copy())
            players.append(build_export_player(participant, stats))

        payload = {
            "generated_at": now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z",
            "scope": {
                "type": "all_time",
                "date": None,
                "timezone": None,
            },
            "player_count": len(players),
            "players": players,
        }

        if args.verbose:
            print(f"Built export with {len(players)} players")

        if args.dry_run:
            print("[DRY RUN] Would write JSON file")
            print(json.dumps(payload, indent=2, ensure_ascii=False)[:500] + "...")
            return

        # 出力ディレクトリ作成
        output_dir = data_dir / "hand_histories" / date_str
        output_dir.mkdir(parents=True, exist_ok=True)

        # ファイル名生成（fast-table と同じ形式）
        timestamp = now.strftime("%Y-%m-%dT%H-%M-%S-") + f"{now.microsecond // 1000:03d}Z"
        filename = f"player-stats-all-time-{timestamp}.json"
        output_path = output_dir / filename

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

        print(f"Written: {output_path}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
