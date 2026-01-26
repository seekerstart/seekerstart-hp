# %%
import re
import pandas as pd
import csv
import glob

from hand_analysis import *

# ここを入力する。
DATE = "20260112"
TABLE_NAME = "2"
BB = "20"


# 前提となるディレクトリ構造
# SeekerStart/{DATE}_table{TABLE_NAME}/
    # poker_now_log_*.csv
    # ledger_*.csv
    # csv_formatting.py で生成されたファイル群: {DATE}_table{TABLE_NAME}_*max.txt 
CSV_DIR = "/Users/yoichiroyamashita/Documents/Documents/dev/PokerNow/csv/SeekerStart"

# パスは自動で取得
n_max_file_list = glob.glob(f"{CSV_DIR}/{DATE}_table{TABLE_NAME}/{DATE}_table{TABLE_NAME}_*?max.txt")
N_MAX = []
for filename in n_max_file_list:
    N_MAX.extend(re.findall(r"_(\d)max", filename))
LEDGER_PATH = glob.glob(f"{CSV_DIR}/{DATE}_table{TABLE_NAME}/ledger_*.csv")[0]
OUTPUT_PATH = f'{CSV_DIR}/{DATE}_table{TABLE_NAME}/' + f'{DATE}_table{TABLE_NAME}_output.txt'

DATE_YEAR = DATE[:4]
DATE_MONTH = DATE[4:6].lstrip("0")
DATE_DAY = DATE[6:8]
DATE_STRING = DATE_YEAR + "/" + DATE_MONTH + "/" + DATE_DAY

for player_num in N_MAX:
    HISTORY_PATH = f'{CSV_DIR}/{DATE}_table{TABLE_NAME}/{DATE}_table{TABLE_NAME}_{player_num}max.txt'
    with open(HISTORY_PATH, "r") as f:
        histories = f.read().split("\n\n")
        PLAYERS = []
        for history in histories:
            names = re.findall(r"seat \d*?: (.*?) \(\d*? in chips\)", history)
            for name in names:
                if name not in PLAYERS:
                    PLAYERS.append(name)
        print(f"プレイヤー名: {PLAYERS}")

    PLAYER_NUM = len(PLAYERS)
    # 各ハンドごとのハンドヒストリーを取得する
    with open(HISTORY_PATH, 'r') as f:
        histories = f.read().split("\n\n")

    print(f"収録ハンド総数: {len(histories)}")


    for player in PLAYERS:
        vpip, hands_vpip, vpip_num = calculate_vpip(histories, player)
        pfr, hands_pfr, pfr_num = calculate_pfr(histories, player)
        three_bet, hands_3b, three_bet_num = calculate_three_bet(histories, player)
        fold_to_three_bet, hands_ft3, ft3_num = calculate_fold_to_three_bet(histories, player)
        cb, hands_cb, cb_num = calculate_cb(histories, player)
        wtsd, hands_wtsd, wtsd_num, wdsd, wdsd_num = calculate_wtsd_wdsd(histories, player)
        output = f"{DATE_STRING}\t{player}\t{player_num}\t{BB}\t\t\t\t{hands_vpip}\t{vpip}\t{vpip_num}\t{pfr}\t{hands_pfr}\t{pfr_num}\t{three_bet}\t{hands_3b}\t{three_bet_num}\t{fold_to_three_bet}\t{hands_ft3}\t{ft3_num}\t{cb}\t{hands_cb}\t{cb_num}\t{wtsd}\t{hands_wtsd}\t{wtsd_num}\t{wdsd}\t{wdsd_num}"
        with open (OUTPUT_PATH, "a") as f:
            f.write(output + "\n")
    print(f"for {player_num}max スタッツ計算完了!!")


output_df = pd.read_csv(OUTPUT_PATH, sep="\t", header=None)

ledger_df = pd.read_csv(LEDGER_PATH)

ledger_df = ledger_df[["player_nickname", "player_id", "session_start_at", "session_end_at", "buy_in", "buy_out", "stack", "net"]]

ledger_df = ledger_df.groupby("player_nickname").agg({
    'player_id': 'first',
    'net': 'sum',
    }).reset_index()


for target_name in ledger_df["player_nickname"]:
    # 該当する行インデックスを取得
    matching_indices = output_df.index[output_df.iloc[:, 1] == target_name]     # magic number
    # そのうち最初の行（1つだけ）に代入
    if not matching_indices.empty:
        first_idx = matching_indices[0]
        score_value = ledger_df.set_index('player_nickname').loc[target_name, 'net']
        output_df.iat[first_idx, 6] = score_value       # magic number

output_df.to_csv(OUTPUT_PATH, sep='\t', index=False, header=False)


print(output_df)
# %%
