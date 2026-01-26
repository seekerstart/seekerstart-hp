# %%

import re
import csv
import glob

DATE = "20260112"
TABLE_NAME = "2"

CSV_DIR = "/Users/yoichiroyamashita/Documents/Documents/dev/PokerNow/csv/SeekerStart"
OUTPUT_TXT = f"{DATE}_table{TABLE_NAME}.txt"
CSV_PATH = glob.glob(f"{CSV_DIR}/{DATE}_table{TABLE_NAME}/poker_now_log_*.csv")[0]

OUTPUT_PATH = f"{CSV_DIR}/{DATE}_table{TABLE_NAME}/" + OUTPUT_TXT.replace(".csv", ".txt")

PLAYER_NAMES = {}

BB = "20"

SUITS = {"♠": "s",
         "♥": "h",
         "♦": "d",
         "♣": "c",}

with open(CSV_PATH, "r") as f:
    rows = []
    csv_histories = csv.reader(f)
    for i in csv_histories:
        rows.append(i[0])

txt = ""
for i in range(1, len(rows)):
    txt += rows[-i] + "\n"


# txt に含まれる プレイヤー名 @ id のプレイヤー名のみを抽出して、プレイヤー名の辞書に登録する
name_and_ids = re.findall(r"\"(.*? @ .*?)\"", txt)

for name_and_id in name_and_ids:
    name = re.findall(r"(.*?) @ .*?", name_and_id)[0]
    if name not in PLAYER_NAMES.keys():
        PLAYER_NAMES[name_and_id] = name
    txt = txt.replace(f'"{name_and_id}"', PLAYER_NAMES[name_and_id])


# ハンド間に改行を入れる
txt = txt.replace(r'-- starting hand', "\n"+"-- starting hand")

histories = re.findall(r"(-- starting hand[\s\S]*?)\n\n", txt)

actions = ["posts", "folds", "checks", "calls", "raises", "bets", "shows", "collected"]      # all in は "raises to nn and go all in" と記述される

histories_new = ""
for history in histories:
    # ハンド情報の冒頭の変換
    history = re.sub(r"\) --", ") --\nHold'em No Limit (10/20)"+"\n"+"Table 'Poker Now - Po' 10-max Seat #3 is the button", history)
    history = re.sub(r"-- starting.*?--", "", history)

    # シートの位置の情報の整形
    stacks = re.findall(r"#(\d*) (.*?) \((.*?)\)", re.findall(r"Player stacks: (.*?)\n", history)[0])
    stack_sentence = ""
    for stack in stacks:
        stack_sentence += f"seat {stack[0]}: {stack[1]} ({stack[2]} in chips)" + "\n"
    history = history.replace(re.findall(r"(Player stacks: .*?\n)", history)[0], stack_sentence)

    # アクションの情報の整形
    for action in actions:
        history = history.replace(f" {action}", f": {action}")
    history = history.replace("collected", "wins")
    history = history.replace(" from pot", "")
    for player in PLAYER_NAMES.values():
        history = re.sub(rf"Uncalled bet of .*? returned to {player}"+"\n", "", history)

    # スートの変換
    for suit in SUITS.keys():
        history = history.replace(suit, SUITS[suit])

    # *** HOLE CARDS *** の追加、ハンド情報の追加
    history = history.replace("posts a small blind of", "posts small blind")
    history = history.replace("posts a big blind of "+BB, "posts big blind "+BB+"\n"+"*** HOLE CARDS ***")
    if "Your hand is" in history:
        my_hand = re.findall(r"Your hand is (.*?)\n", history)[0]
        history = history.replace("*** HOLE CARDS ***" + "\n", "*** HOLE CARDS ***" + "\n" + "Dealt to you [" + my_hand.replace(",", "") + "]" + "\n")
        history = history.replace("Your hand is " + my_hand + "\n", "")

    # *** FLOP *** などの追加
    streets = ["Flop", "Turn", "River"]#, "SHOW DOWN", "SUMMARY"]
    for street in streets:
        if street in history:
            history = history.replace(f"{street}:", f"*** {street.upper()} ***")

    # with Two Pair, J's & 10's (combination: Jc, Js, 10s, 10h, 9c) みたいな情報の削除
    history = re.sub(r" with .*? \(combination: .*?\)", "", history)
    # 末尾の -- ending hand #1 -- の削除
    history = re.sub(r"-- ending hand #\d* --[\s\S]*", "", history)

    histories_new += history + "\n\n"
    histories_new = histories_new[:-2]


with open(OUTPUT_PATH, "w") as f:
    f.write(histories_new)
    print(f"{OUTPUT_TXT} にcsv成形終了!! 参加者数ごとの分割を行います。")


def extract_player_num(txt: str):
    return len(re.findall(r"\nseat \d*?: .*? \(\d*? in chips\)", txt))

with open(OUTPUT_PATH, "r") as f:
    histories = f.read().split("\n\n")

split_histories = {2: "", 3: "", 4: "", 5: "", 6: "", 7: "", 8: "", 9: "", 10: ""}

for history in histories:
    print(extract_player_num(history))
    print(history)
    split_histories[extract_player_num(history)] +=  "\n" + history + "\n"

for player_num in split_histories.keys():
    if split_histories[player_num] != "":
        with open(OUTPUT_PATH.replace(".txt", f"_{player_num}max.txt"), "w") as f:
            f.write(split_histories[player_num].rstrip('\r\n').lstrip('\r\n'))
            print(f"{player_num}max.txt に分割完了!!")

# %%
