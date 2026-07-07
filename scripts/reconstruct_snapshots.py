#!/usr/bin/env python3
"""
6/29 スナップショットの再構築スクリプト

houou-main の R4(6/29) と R5(7/6) のハンドデータから
プレイヤースタッツを計算し、正しい累積スナップショットを生成する。

方針:
  1. hand_players + hand_actions から R4/R5 の各スタッツを直接計算
  2. houou-shared（凍結データ）+ R4 分 = 6/29 の正しい all-time snapshot
  3. houou-shared + houou-main = 7/6 の正しい all-time snapshot（予選卓 houou-yosen は除外）
"""

import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Error: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable is required")
    sys.exit(1)

STAT_KEYS = [
    "hands", "vpip_hands", "pfr_hands",
    "three_bet_hands", "three_bet_opp",
    "four_bet_hands", "four_bet_opp",
    "fold_to_three_bet_hands", "faced_three_bet_opp",
    "fold_to_four_bet_hands", "faced_four_bet_opp",
    "cbet_flop_made", "cbet_flop_opp",
    "cbet_turn_made", "cbet_turn_opp",
    "cbet_river_made", "cbet_river_opp",
    "fold_to_cbet_flop", "fold_to_cbet_flop_opp",
    "fold_to_cbet_turn", "fold_to_cbet_turn_opp",
    "fold_to_cbet_river", "fold_to_cbet_river_opp",
    "agg_raise", "agg_call", "agg_check",
    "saw_flop_hands", "went_showdown_hands",
    "won_showdown_hands", "won_when_saw_flop_hands",
    "net_cbb", "showdown_cbb", "non_showdown_cbb",
]


def empty_stats():
    return {k: 0 for k in STAT_KEYS}


def add_stats(a, b):
    return {k: a.get(k, 0) + b.get(k, 0) for k in STAT_KEYS}


def sub_stats(a, b):
    return {k: a.get(k, 0) - b.get(k, 0) for k in STAT_KEYS}


# --------------- DB fetch functions ---------------

def fetch_houou_main_hands(conn, date_str):
    """指定日の houou-main ハンドIDリストを取得"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM hands
            WHERE server_id = 'houou-main'
            AND DATE(started_at AT TIME ZONE 'UTC') = %s
            ORDER BY id
        """, (date_str,))
        return [row[0] for row in cur.fetchall()]


def fetch_hand_players_bulk(conn, hand_ids):
    """hand_players を一括取得"""
    if not hand_ids:
        return {}
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT hand_id, user_id::text, delta_cbb, showdown,
                   folded_street
            FROM hand_players
            WHERE hand_id = ANY(%s)
        """, (hand_ids,))
        result = defaultdict(list)
        for row in cur.fetchall():
            result[row["hand_id"]].append(row)
        return result


def fetch_hand_actions_bulk(conn, hand_ids):
    """hand_actions を一括取得（action_index順）"""
    if not hand_ids:
        return {}
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT hand_id, user_id::text, street, action, amount_cbb
            FROM hand_actions
            WHERE hand_id = ANY(%s)
            ORDER BY hand_id, action_index
        """, (hand_ids,))
        result = defaultdict(list)
        for row in cur.fetchall():
            result[row["hand_id"]].append(row)
        return result


def fetch_per_server_stats(conn):
    """player_stats を server_id ごとに取得"""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT user_id::text, server_id,
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
        """)
        result = defaultdict(dict)
        for row in cur.fetchall():
            uid = row["user_id"]
            sid = row["server_id"]
            stats = {k: int(v) if v is not None else 0
                     for k, v in row.items()
                     if k not in ("user_id", "server_id")}
            result[uid][sid] = stats
        return result


def fetch_participants(conn):
    """全参加者情報を取得"""
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
        return {row["user_id"]: row for row in cur.fetchall()}


# --------------- Hand analysis ---------------

def analyze_hand(hand_id, players_data, actions_data):
    """1ハンドを分析し、各プレイヤーのスタッツ貢献を返す"""
    per_player = defaultdict(empty_stats)
    player_uids = set()

    # Check if flop was actually dealt:
    # - any action on flop/turn/river, OR
    # - any player went to showdown (all-in preflop runout), OR
    # - any player folded on flop/turn/river
    hand_reached_flop = (
        any(a["street"] != "preflop" for a in actions_data)
        or any(p["showdown"] for p in players_data)
        or any(p["folded_street"] in ("flop", "turn", "river") for p in players_data)
    )

    for p in players_data:
        uid = p["user_id"]
        player_uids.add(uid)
        per_player[uid]["hands"] = 1
        per_player[uid]["net_cbb"] = int(p["delta_cbb"] or 0)

        did_not_fold_preflop = (p["folded_street"] is None or p["folded_street"] != "preflop")
        saw_flop = hand_reached_flop and did_not_fold_preflop
        showdown = bool(p["showdown"])
        won = int(p["delta_cbb"] or 0) > 0

        if saw_flop:
            per_player[uid]["saw_flop_hands"] = 1
        if showdown:
            per_player[uid]["went_showdown_hands"] = 1
            per_player[uid]["showdown_cbb"] = int(p["delta_cbb"] or 0)
        else:
            per_player[uid]["non_showdown_cbb"] = int(p["delta_cbb"] or 0)
        if showdown and won:
            per_player[uid]["won_showdown_hands"] = 1
        if saw_flop and won:
            per_player[uid]["won_when_saw_flop_hands"] = 1

    # Split actions by street
    preflop_actions = []
    postflop_actions = defaultdict(list)  # street -> [actions]
    for a in actions_data:
        if a["street"] == "preflop":
            preflop_actions.append(a)
        else:
            postflop_actions[a["street"]].append(a)

    # --- Preflop analysis ---
    preflop_raise_count = 0
    raisers = []  # [(uid, raise_number)]
    players_who_vpipped = set()

    for a in preflop_actions:
        uid = a["user_id"]
        act = a["action"]

        # VPIP: call, raise, bet, or all_in on preflop
        if act in ("call", "raise", "bet", "all_in"):
            if uid not in players_who_vpipped:
                per_player[uid]["vpip_hands"] = 1
                players_who_vpipped.add(uid)

        # PFR: raise or all_in on preflop (first raise action by this player)
        if act in ("raise", "all_in"):
            preflop_raise_count += 1
            raisers.append((uid, preflop_raise_count))

            # Only count PFR once per player
            if per_player[uid]["pfr_hands"] == 0:
                per_player[uid]["pfr_hands"] = 1

            if preflop_raise_count == 2:
                per_player[uid]["three_bet_hands"] = 1
            elif preflop_raise_count == 3:
                per_player[uid]["four_bet_hands"] = 1

        # 3bet opportunity: player acts when exactly 1 raise has occurred,
        # and they are NOT the original raiser
        if preflop_raise_count == 1:
            original_raiser = raisers[0][0]
            if uid != original_raiser:
                if act in ("call", "raise", "fold", "all_in"):
                    per_player[uid]["three_bet_opp"] += 1

        # 4bet opportunity: player acts when exactly 2 raises have occurred,
        # and they are NOT the 3bettor
        if preflop_raise_count == 2 and len(raisers) >= 2:
            three_bettor = raisers[1][0]
            if uid != three_bettor:
                if act in ("call", "raise", "fold", "all_in"):
                    per_player[uid]["four_bet_opp"] += 1

    # faced_three_bet_opp / fold_to_three_bet:
    # The original raiser faces a 3bet if raise_count >= 2
    if preflop_raise_count >= 2 and len(raisers) >= 1:
        original_raiser = raisers[0][0]
        per_player[original_raiser]["faced_three_bet_opp"] = 1
        # Check if original raiser folded after the 3bet
        after_3bet = False
        for a in preflop_actions:
            if after_3bet and a["user_id"] == original_raiser:
                if a["action"] == "fold":
                    per_player[original_raiser]["fold_to_three_bet_hands"] = 1
                break
            if len(raisers) >= 2 and a["user_id"] == raisers[1][0] and a["action"] in ("raise", "all_in"):
                after_3bet = True

    # faced_four_bet_opp / fold_to_four_bet:
    if preflop_raise_count >= 3 and len(raisers) >= 2:
        three_bettor = raisers[1][0]
        per_player[three_bettor]["faced_four_bet_opp"] = 1
        after_4bet = False
        for a in preflop_actions:
            if after_4bet and a["user_id"] == three_bettor:
                if a["action"] == "fold":
                    per_player[three_bettor]["fold_to_four_bet_hands"] = 1
                break
            if len(raisers) >= 3 and a["user_id"] == raisers[2][0] and a["action"] in ("raise", "all_in"):
                after_4bet = True

    # --- Postflop analysis ---
    # Determine last preflop aggressor (for cbet)
    last_pf_aggressor = raisers[-1][0] if raisers else None

    # Process each postflop street
    street_order = ["flop", "turn", "river"]
    prev_street_aggressor = last_pf_aggressor

    for street in street_order:
        street_actions = postflop_actions.get(street, [])
        if not street_actions:
            prev_street_aggressor = None
            continue

        # Cbet: if the previous street's aggressor bets this street
        cbet_candidate = prev_street_aggressor
        street_first_aggressor = None
        cbet_key_made = f"cbet_{street}_made"
        cbet_key_opp = f"cbet_{street}_opp"
        fold_cbet_key = f"fold_to_cbet_{street}"
        fold_cbet_opp_key = f"fold_to_cbet_{street}_opp"

        if cbet_candidate and any(a["user_id"] == cbet_candidate for a in street_actions):
            per_player[cbet_candidate][cbet_key_opp] = 1

        cbet_happened = False
        for a in street_actions:
            uid = a["user_id"]
            act = a["action"]

            # Aggression stats (postflop only)
            if act in ("raise", "bet", "all_in"):
                per_player[uid]["agg_raise"] += 1
                if street_first_aggressor is None:
                    street_first_aggressor = uid
            elif act == "call":
                per_player[uid]["agg_call"] += 1
            elif act == "check":
                per_player[uid]["agg_check"] += 1

            # Cbet detection
            if uid == cbet_candidate and act in ("bet", "raise", "all_in"):
                per_player[uid][cbet_key_made] = 1
                cbet_happened = True

            # Fold to cbet
            if cbet_happened and uid != cbet_candidate:
                if act in ("fold", "call", "raise", "all_in"):
                    per_player[uid][fold_cbet_opp_key] += 1
                    if act == "fold":
                        per_player[uid][fold_cbet_key] += 1

        prev_street_aggressor = street_first_aggressor

    return per_player


def compute_stats_for_hands(conn, hand_ids, verbose=False):
    """指定ハンドIDリストからプレイヤースタッツを計算"""
    if not hand_ids:
        return {}

    BATCH_SIZE = 2000
    total_stats = defaultdict(empty_stats)

    for i in range(0, len(hand_ids), BATCH_SIZE):
        batch = hand_ids[i:i + BATCH_SIZE]
        if verbose:
            print(f"  Processing hands {i+1}-{i+len(batch)} of {len(hand_ids)}...")

        players_bulk = fetch_hand_players_bulk(conn, batch)
        actions_bulk = fetch_hand_actions_bulk(conn, batch)

        for hand_id in batch:
            pdata = players_bulk.get(hand_id, [])
            adata = actions_bulk.get(hand_id, [])
            if not pdata:
                continue

            hand_stats = analyze_hand(hand_id, pdata, adata)
            for uid, stats in hand_stats.items():
                for k in STAT_KEYS:
                    total_stats[uid][k] += stats[k]

    return dict(total_stats)


# --------------- JSON output ---------------

def safe_pct(numerator, denominator, decimals=1):
    if not denominator:
        return 0
    return round((numerator / denominator) * 100, decimals)


def build_export_json(participants, stats_by_user, generated_at_str):
    """fetch_stats.py と同じ JSON フォーマットで出力を構築"""
    CBB_PER_BB = 100
    players = []

    for uid, pinfo in sorted(participants.items(), key=lambda x: x[1]["display_name"]):
        stats = stats_by_user.get(uid, empty_stats())
        if stats["hands"] == 0:
            stats = empty_stats()

        hands = stats["hands"]
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

        agg_r = stats["agg_raise"]
        agg_c = stats["agg_call"]
        agg_ch = stats["agg_check"]
        if agg_c > 0:
            aggression = f"{agg_r / agg_c:.2f}"
        elif agg_r > 0:
            aggression = "99.00"
        else:
            aggression = "0.00"
        agg_freq_den = agg_r + agg_c + agg_ch
        aggression_freq_pct = safe_pct(agg_r, agg_freq_den)

        wtsd_pct = safe_pct(stats["went_showdown_hands"], stats["saw_flop_hands"])
        wsd_pct = safe_pct(stats["won_showdown_hands"], stats["went_showdown_hands"])
        wwsf_pct = safe_pct(stats["won_when_saw_flop_hands"], stats["saw_flop_hands"])
        bb_per_100 = f"{(stats['net_cbb'] / CBB_PER_BB / hands * 100):.2f}" if hands else "0.00"

        summary = {
            "hands": hands,
            "vpip_pct": vpip_pct, "pfr_pct": pfr_pct,
            "three_bet_pct": three_bet_pct, "four_bet_pct": four_bet_pct,
            "fold_to_three_bet_pct": fold_to_three_bet_pct,
            "fold_to_four_bet_pct": fold_to_four_bet_pct,
            "cbet_flop_pct": cbet_flop_pct, "cbet_turn_pct": cbet_turn_pct,
            "cbet_river_pct": cbet_river_pct,
            "fold_to_cbet_flop_pct": fold_to_cbet_flop_pct,
            "fold_to_cbet_turn_pct": fold_to_cbet_turn_pct,
            "fold_to_cbet_river_pct": fold_to_cbet_river_pct,
            "vpip_hands": stats["vpip_hands"], "pfr_hands": stats["pfr_hands"],
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
            "agg_raise": agg_r, "agg_call": agg_c, "agg_check": agg_ch,
            "saw_flop_hands": stats["saw_flop_hands"],
            "went_showdown_hands": stats["went_showdown_hands"],
            "won_showdown_hands": stats["won_showdown_hands"],
            "won_when_saw_flop_hands": stats["won_when_saw_flop_hands"],
            "aggression": aggression,
            "aggression_freq_pct": aggression_freq_pct,
            "wtsd_pct": wtsd_pct, "wsd_pct": wsd_pct, "wwsf_pct": wwsf_pct,
            "bb_per_100": bb_per_100,
            "net_cbb": stats["net_cbb"],
            "showdown_cbb": stats["showdown_cbb"],
            "non_showdown_cbb": stats["non_showdown_cbb"],
        }

        metrics = {
            "vpip": {"pct": vpip_pct, "numerator": stats["vpip_hands"], "denominator": hands},
            "pfr": {"pct": pfr_pct, "numerator": stats["pfr_hands"], "denominator": hands},
            "three_bet": {"pct": three_bet_pct, "numerator": stats["three_bet_hands"], "denominator": stats["three_bet_opp"]},
            "four_bet": {"pct": four_bet_pct, "numerator": stats["four_bet_hands"], "denominator": stats["four_bet_opp"]},
            "fold_to_three_bet": {"pct": fold_to_three_bet_pct, "numerator": stats["fold_to_three_bet_hands"], "denominator": stats["faced_three_bet_opp"]},
            "fold_to_four_bet": {"pct": fold_to_four_bet_pct, "numerator": stats["fold_to_four_bet_hands"], "denominator": stats["faced_four_bet_opp"]},
            "cbet_flop": {"pct": cbet_flop_pct, "numerator": stats["cbet_flop_made"], "denominator": stats["cbet_flop_opp"]},
            "cbet_turn": {"pct": cbet_turn_pct, "numerator": stats["cbet_turn_made"], "denominator": stats["cbet_turn_opp"]},
            "cbet_river": {"pct": cbet_river_pct, "numerator": stats["cbet_river_made"], "denominator": stats["cbet_river_opp"]},
            "fold_to_cbet_flop": {"pct": fold_to_cbet_flop_pct, "numerator": stats["fold_to_cbet_flop"], "denominator": stats["fold_to_cbet_flop_opp"]},
            "fold_to_cbet_turn": {"pct": fold_to_cbet_turn_pct, "numerator": stats["fold_to_cbet_turn"], "denominator": stats["fold_to_cbet_turn_opp"]},
            "fold_to_cbet_river": {"pct": fold_to_cbet_river_pct, "numerator": stats["fold_to_cbet_river"], "denominator": stats["fold_to_cbet_river_opp"]},
            "aggression": {"value": aggression, "numerator": agg_r, "denominator": agg_c},
            "aggression_frequency": {"pct": aggression_freq_pct, "numerator": agg_r, "denominator": agg_freq_den},
            "wtsd": {"pct": wtsd_pct, "numerator": stats["went_showdown_hands"], "denominator": stats["saw_flop_hands"]},
            "wsd": {"pct": wsd_pct, "numerator": stats["won_showdown_hands"], "denominator": stats["went_showdown_hands"]},
            "wwsf": {"pct": wwsf_pct, "numerator": stats["won_when_saw_flop_hands"], "denominator": stats["saw_flop_hands"]},
            "bb_per_100": {"value": float(bb_per_100), "numerator": stats["net_cbb"], "denominator": hands},
            "net": {"cbb": stats["net_cbb"]},
            "showdown": {"cbb": stats["showdown_cbb"]},
            "non_showdown": {"cbb": stats["non_showdown_cbb"]},
        }

        raw_totals = {k: stats[k] for k in STAT_KEYS}

        players.append({
            "user_id": uid,
            "display_name": pinfo["display_name"],
            "discord_id": pinfo.get("discord_id"),
            "discord_username": None,
            "discord_global_name": None,
            "is_bot": pinfo["is_bot"],
            "summary": summary,
            "metrics": metrics,
            "raw_totals": raw_totals,
        })

    return {
        "generated_at": generated_at_str,
        "scope": {"type": "all_time", "date": None, "timezone": None},
        "player_count": len(players),
        "players": players,
    }


# --------------- Main ---------------

def main():
    conn = psycopg2.connect(DATABASE_URL)

    try:
        print("=== 6/29 スナップショット再構築 ===\n")

        # 1. 参加者情報を取得
        print("1. Fetching participants...")
        participants = fetch_participants(conn)
        print(f"   {len(participants)} participants found")

        # 2. houou-main ハンドを日付別に取得
        print("\n2. Fetching houou-main hand IDs...")
        r4_hands = fetch_houou_main_hands(conn, "2026-06-29")
        r5_hands = fetch_houou_main_hands(conn, "2026-07-06")
        print(f"   R4 (6/29): {len(r4_hands)} hands")
        print(f"   R5 (7/6): {len(r5_hands)} hands")

        # 3. R4 スタッツを計算
        print("\n3. Computing R4 stats from hand data...")
        r4_stats = compute_stats_for_hands(conn, r4_hands, verbose=True)
        print(f"   R4: {len(r4_stats)} players")

        # 4. R5 スタッツを計算
        print("\n4. Computing R5 stats from hand data...")
        r5_stats = compute_stats_for_hands(conn, r5_hands, verbose=True)
        print(f"   R5: {len(r5_stats)} players")

        # 5. per-server stats を取得して検証
        print("\n5. Fetching per-server stats for validation...")
        server_stats = fetch_per_server_stats(conn)

        # 検証: R4 + R5 == houou-main for each player
        print("\n6. Validating R4 + R5 == houou-main...")
        validation_errors = 0
        for uid in set(list(r4_stats.keys()) + list(r5_stats.keys())):
            r4 = r4_stats.get(uid, empty_stats())
            r5 = r5_stats.get(uid, empty_stats())
            computed_sum = add_stats(r4, r5)
            db_main = server_stats.get(uid, {}).get("houou-main", empty_stats())

            for k in ["hands", "net_cbb", "saw_flop_hands", "went_showdown_hands"]:
                if computed_sum[k] != db_main[k]:
                    pname = participants.get(uid, {}).get("display_name", uid)
                    print(f"   MISMATCH {pname}: {k} computed={computed_sum[k]} vs db={db_main[k]}")
                    validation_errors += 1

        if validation_errors == 0:
            print("   All key stats match!")
        else:
            print(f"   {validation_errors} mismatches found (proceeding anyway)")

        # 7. 6/29 all-time = houou-shared + R4 houou-main
        print("\n7. Building 6/29 all-time snapshot...")
        snapshot_0629 = {}
        for uid, pinfo in participants.items():
            shared = server_stats.get(uid, {}).get("houou-shared", empty_stats())
            r4 = r4_stats.get(uid, empty_stats())
            snapshot_0629[uid] = add_stats(shared, r4)

        players_with_hands = sum(1 for s in snapshot_0629.values() if s["hands"] > 0)
        print(f"   {players_with_hands} players with hands > 0")

        # 8. 7/6 all-time = houou-shared + houou-main (予選卓 houou-yosen は除外)
        print("\n8. Building 7/6 all-time snapshot...")
        snapshot_0706 = {}
        for uid, pinfo in participants.items():
            shared = server_stats.get(uid, {}).get("houou-shared", empty_stats())
            main = server_stats.get(uid, {}).get("houou-main", empty_stats())
            snapshot_0706[uid] = add_stats(shared, main)

        players_with_hands_0706 = sum(1 for s in snapshot_0706.values() if s["hands"] > 0)
        print(f"   {players_with_hands_0706} players with hands > 0")

        # 9. JSON 出力
        base_dir = Path(__file__).parent.parent / "data" / "hand_histories"

        # 6/29
        out_dir_0629 = base_dir / "20260629"
        out_dir_0629.mkdir(parents=True, exist_ok=True)
        json_0629 = build_export_json(
            participants, snapshot_0629,
            "2026-06-29T17:16:33.251Z"
        )
        out_path_0629 = out_dir_0629 / "player-stats-all-time-2026-06-29T17-16-33-251Z.json"
        with open(out_path_0629, "w", encoding="utf-8") as f:
            json.dump(json_0629, f, indent=2, ensure_ascii=False)
        print(f"\n9. Written: {out_path_0629}")

        # 7/6
        out_dir_0706 = base_dir / "20260706"
        out_dir_0706.mkdir(parents=True, exist_ok=True)
        json_0706 = build_export_json(
            participants, snapshot_0706,
            "2026-07-06T14:30:00.000Z"
        )
        out_path_0706 = out_dir_0706 / "player-stats-all-time-2026-07-06T14-30-00-000Z.json"
        with open(out_path_0706, "w", encoding="utf-8") as f:
            json.dump(json_0706, f, indent=2, ensure_ascii=False)
        print(f"   Written: {out_path_0706}")

        # 10. サマリー表示
        print("\n=== Summary ===")
        print(f"6/29 snapshot: {json_0629['player_count']} players")
        print(f"7/6  snapshot: {json_0706['player_count']} players")

        # 12問題プレイヤーの検証
        problem_names = ["Deke", "Guest", "Kou", "Nao", "Neku", "Untri",
                         "kiyo", "tica", "くりきんとん", "すず", "はなうさ", "三崎美咲"]
        print("\n--- 12 Problem Players R4 contribution ---")
        for uid, pinfo in participants.items():
            if pinfo["display_name"] in problem_names:
                r4 = r4_stats.get(uid, empty_stats())
                s29 = snapshot_0629.get(uid, empty_stats())
                print(f"  {pinfo['display_name']}: R4 hands={r4['hands']}, "
                      f"6/29 total hands={s29['hands']}, net_cbb={s29['net_cbb']}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
