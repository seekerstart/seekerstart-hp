"""
Poker Now CSV パーサー
ハンド履歴CSVをパースしてPokerStars形式に変換する
"""

import re
import csv
from pathlib import Path
from typing import List, Dict, Tuple, Optional


class PokerNowParser:
    """Poker Now のCSVログをパースするクラス"""

    SUITS = {"♠": "s", "♥": "h", "♦": "d", "♣": "c"}
    ACTIONS = ["posts", "folds", "checks", "calls", "raises", "bets", "shows", "collected"]

    def __init__(self, csv_path: str, bb: int = 20):
        self.csv_path = Path(csv_path)
        self.bb = bb
        self.player_names = {}
        self.raw_text = ""

    def parse(self) -> Tuple[str, Dict[str, str]]:
        """
        CSVファイルをパースしてテキスト形式に変換

        Returns:
            Tuple[str, Dict[str, str]]: (変換後テキスト, プレイヤー名辞書)
        """
        # CSV読み込み
        rows = self._read_csv()

        # 逆順に結合（Poker Nowは新しい順で記録されるため）
        self.raw_text = "\n".join(reversed(rows[1:]))  # ヘッダーを除く

        # プレイヤー名を抽出
        self._extract_player_names()

        # テキストを変換
        formatted = self._format_text()

        return formatted, self.player_names

    def _read_csv(self) -> List[str]:
        """CSVファイルを読み込む"""
        with open(self.csv_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            return [row[0] for row in reader if row]

    def _extract_player_names(self) -> None:
        """プレイヤー名を抽出して辞書に登録"""
        name_and_ids = re.findall(r'"(.*? @ .*?)"', self.raw_text)
        for name_and_id in name_and_ids:
            match = re.match(r"(.*?) @ (.*)", name_and_id)
            if match:
                name = match.group(1)
                if name_and_id not in self.player_names:
                    self.player_names[name_and_id] = name

    def _format_text(self) -> str:
        """テキストをPokerStars形式に変換"""
        txt = self.raw_text

        # プレイヤー名を置換（IDを除去）
        for name_and_id, name in self.player_names.items():
            txt = txt.replace(f'"{name_and_id}"', name)

        # ハンド間に改行を入れる
        txt = txt.replace("-- starting hand", "\n-- starting hand")

        # 各ハンドを抽出して変換
        histories = re.findall(r"(-- starting hand[\s\S]*?)\n\n", txt + "\n\n")

        formatted_histories = []
        for history in histories:
            formatted = self._format_hand(history)
            if formatted:
                formatted_histories.append(formatted)

        return "\n\n".join(formatted_histories)

    def _format_hand(self, history: str) -> str:
        """1ハンド分を変換"""
        # ハンド情報の冒頭を変換
        history = re.sub(
            r"\) --",
            f") --\nHold'em No Limit (10/{self.bb})\n"
            "Table 'Poker Now - Po' 10-max Seat #3 is the button",
            history
        )
        history = re.sub(r"-- starting.*?--", "", history)

        # シートの位置情報を整形
        stack_match = re.findall(r"Player stacks: (.*?)\n", history)
        if stack_match:
            stacks = re.findall(r"#(\d*) (.*?) \((.*?)\)", stack_match[0])
            stack_sentence = ""
            for stack in stacks:
                stack_sentence += f"seat {stack[0]}: {stack[1]} ({stack[2]} in chips)\n"
            history = history.replace(
                re.findall(r"(Player stacks: .*?\n)", history)[0],
                stack_sentence
            )

        # アクションの情報を整形
        for action in self.ACTIONS:
            history = history.replace(f" {action}", f": {action}")
        history = history.replace("collected", "wins")
        history = history.replace(" from pot", "")

        # 未コールベットの返却を削除
        for player in self.player_names.values():
            history = re.sub(rf"Uncalled bet of .*? returned to {re.escape(player)}\n", "", history)

        # スートを変換
        for suit, short in self.SUITS.items():
            history = history.replace(suit, short)

        # ブラインドポストとHOLE CARDSの追加
        history = history.replace("posts a small blind of", "posts small blind")
        history = history.replace(
            f"posts a big blind of {self.bb}",
            f"posts big blind {self.bb}\n*** HOLE CARDS ***"
        )

        # 自分のハンド情報を追加
        if "Your hand is" in history:
            my_hand_match = re.findall(r"Your hand is (.*?)\n", history)
            if my_hand_match:
                my_hand = my_hand_match[0]
                history = history.replace(
                    "*** HOLE CARDS ***\n",
                    f"*** HOLE CARDS ***\nDealt to you [{my_hand.replace(',', '')}]\n"
                )
                history = history.replace(f"Your hand is {my_hand}\n", "")

        # ストリートマーカーを追加
        for street in ["Flop", "Turn", "River"]:
            if street in history:
                history = history.replace(f"{street}:", f"*** {street.upper()} ***")

        # 組み合わせ情報を削除
        history = re.sub(r" with .*? \(combination: .*?\)", "", history)

        # 末尾のハンド終了情報を削除
        history = re.sub(r"-- ending hand #\d* --[\s\S]*", "", history)

        return history.strip()

    def get_histories_by_player_count(self, formatted_text: str) -> Dict[int, str]:
        """
        プレイヤー数ごとにハンド履歴を分割

        Returns:
            Dict[int, str]: {プレイヤー数: ハンド履歴テキスト}
        """
        histories = formatted_text.split("\n\n")
        split_histories = {i: [] for i in range(2, 11)}

        for history in histories:
            player_count = len(re.findall(r"\nseat \d+: .*? \(\d+ in chips\)", history))
            if 2 <= player_count <= 10:
                split_histories[player_count].append(history)

        return {k: "\n\n".join(v) for k, v in split_histories.items() if v}


class LedgerParser:
    """Ledger CSVをパースするクラス"""

    def __init__(self, ledger_path: str):
        self.ledger_path = Path(ledger_path)

    def parse(self) -> Dict[str, Dict]:
        """
        Ledger CSVをパースしてプレイヤー別の収支を取得

        Returns:
            Dict[str, Dict]: {プレイヤーID: {nickname, net, ...}}
        """
        import pandas as pd

        df = pd.read_csv(self.ledger_path)
        df = df[["player_nickname", "player_id", "net"]]

        # プレイヤーごとに集計
        grouped = df.groupby("player_id").agg({
            "player_nickname": "first",
            "net": "sum"
        }).reset_index()

        result = {}
        for _, row in grouped.iterrows():
            result[row["player_id"]] = {
                "nickname": row["player_nickname"],
                "net": int(row["net"])
            }

        return result


def extract_players_from_history(history: str) -> List[str]:
    """ハンド履歴からプレイヤー名を抽出"""
    return re.findall(r"seat \d+: (.*?) \(\d+ in chips\)", history)


def extract_player_id_map(raw_csv_text: str) -> Dict[str, str]:
    """
    生のCSVテキストからプレイヤー名とIDのマッピングを抽出

    Returns:
        Dict[str, str]: {プレイヤー名: プレイヤーID}
    """
    name_id_map = {}
    # "name @ id" パターンを抽出（IDは @ 以降の文字列全体）
    matches = re.findall(r'"(.*?) @ ([^"]+)"', raw_csv_text)
    for name, player_id in matches:
        if name not in name_id_map:
            name_id_map[name] = player_id
    return name_id_map


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python csv_formatter.py <csv_path> [bb]")
        sys.exit(1)

    csv_path = sys.argv[1]
    bb = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    parser = PokerNowParser(csv_path, bb)
    formatted, players = parser.parse()

    print(f"Parsed {len(players)} players")
    print(f"Output length: {len(formatted)} characters")
