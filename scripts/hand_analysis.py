"""
ハンド分析モジュール
スタッツ計算のための各種関数とStatsCalculatorクラス
"""

import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass, field


@dataclass
class PlayerStats:
    """プレイヤーの集計スタッツを保持するデータクラス"""
    player_id: str = ""
    display_name: str = ""
    league: str = "C"
    net: int = 0
    hands: int = 0
    vpip_hands: int = 0
    vpip_count: int = 0
    pfr_hands: int = 0
    pfr_count: int = 0
    three_bet_hands: int = 0
    three_bet_count: int = 0
    fold_to_3bet_hands: int = 0
    fold_to_3bet_count: int = 0
    cb_hands: int = 0
    cb_count: int = 0
    wtsd_hands: int = 0
    wtsd_count: int = 0
    wdsd_count: int = 0

    @property
    def vpip(self) -> float:
        """VPIP率を計算"""
        if self.vpip_hands == 0:
            return 0.0
        return round(self.vpip_count / self.vpip_hands * 100, 2)

    @property
    def pfr(self) -> float:
        """PFR率を計算"""
        if self.pfr_hands == 0:
            return 0.0
        return round(self.pfr_count / self.pfr_hands * 100, 2)

    @property
    def three_bet(self) -> float:
        """3bet率を計算"""
        if self.three_bet_hands == 0:
            return 0.0
        return round(self.three_bet_count / self.three_bet_hands * 100, 2)

    @property
    def fold_to_3bet(self) -> float:
        """Fold to 3bet率を計算"""
        if self.fold_to_3bet_hands == 0:
            return 0.0
        return round(self.fold_to_3bet_count / self.fold_to_3bet_hands * 100, 2)

    @property
    def cb(self) -> float:
        """CB率を計算"""
        if self.cb_hands == 0:
            return 0.0
        return round(self.cb_count / self.cb_hands * 100, 2)

    @property
    def wtsd(self) -> float:
        """WTSD率を計算"""
        if self.wtsd_hands == 0:
            return 0.0
        return round(self.wtsd_count / self.wtsd_hands * 100, 2)

    @property
    def wdsd(self) -> float:
        """W$SD率を計算"""
        if self.wtsd_count == 0:
            return 0.0
        return round(self.wdsd_count / self.wtsd_count * 100, 2)

    def merge(self, other: 'PlayerStats') -> None:
        """他のPlayerStatsとマージする"""
        self.net += other.net
        self.hands += other.hands
        self.vpip_hands += other.vpip_hands
        self.vpip_count += other.vpip_count
        self.pfr_hands += other.pfr_hands
        self.pfr_count += other.pfr_count
        self.three_bet_hands += other.three_bet_hands
        self.three_bet_count += other.three_bet_count
        self.fold_to_3bet_hands += other.fold_to_3bet_hands
        self.fold_to_3bet_count += other.fold_to_3bet_count
        self.cb_hands += other.cb_hands
        self.cb_count += other.cb_count
        self.wtsd_hands += other.wtsd_hands
        self.wtsd_count += other.wtsd_count
        self.wdsd_count += other.wdsd_count

    def to_dict(self) -> dict:
        """辞書形式で出力"""
        return {
            "player_id": self.player_id,
            "プレイヤー": self.display_name,
            "リーグ": self.league,
            "収支": self.net,
            "ハンド数": self.hands,
            "VPIP": self.vpip,
            "PFR": self.pfr,
            "3bet": self.three_bet,
            "Fold to 3bet": self.fold_to_3bet,
            "CB": self.cb,
            "WTSD": self.wtsd,
            "W$SD": self.wdsd,
        }


class StatsCalculator:
    """プレイヤースタッツを計算するクラス"""

    def __init__(self, histories: List[str]):
        """
        Args:
            histories: ハンド履歴のリスト（各要素は1ハンド分のテキスト）
        """
        self.histories = histories

    def calculate_all(self, player: str) -> PlayerStats:
        """
        プレイヤーの全スタッツを計算

        Args:
            player: プレイヤー名

        Returns:
            PlayerStats: 計算されたスタッツ
        """
        stats = PlayerStats(display_name=player)

        vpip_rate, vpip_hands, vpip_count = calculate_vpip(self.histories, player)
        pfr_rate, pfr_hands, pfr_count = calculate_pfr(self.histories, player)
        three_bet_rate, three_bet_hands, three_bet_count = calculate_three_bet(self.histories, player)
        ft3_rate, ft3_hands, ft3_count = calculate_fold_to_three_bet(self.histories, player)
        cb_rate, cb_hands, cb_count = calculate_cb(self.histories, player)
        wtsd_rate, wtsd_hands, wtsd_count, wdsd_rate, wdsd_count = calculate_wtsd_wdsd(self.histories, player)

        stats.hands = vpip_hands
        stats.vpip_hands = vpip_hands
        stats.vpip_count = vpip_count
        stats.pfr_hands = pfr_hands
        stats.pfr_count = pfr_count
        stats.three_bet_hands = three_bet_hands
        stats.three_bet_count = three_bet_count
        stats.fold_to_3bet_hands = ft3_hands
        stats.fold_to_3bet_count = ft3_count
        stats.cb_hands = cb_hands
        stats.cb_count = cb_count
        stats.wtsd_hands = wtsd_hands
        stats.wtsd_count = wtsd_count
        stats.wdsd_count = wdsd_count

        return stats

    def get_all_players(self) -> List[str]:
        """ハンド履歴に登場する全プレイヤーを取得"""
        players = set()
        for history in self.histories:
            names = re.findall(r"seat \d+: (.*?) \(\d+ in chips\)", history)
            players.update(names)
        return list(players)


# ==============================================================================
# 以下、既存の関数群（互換性維持のため残す）
# ==============================================================================

def extract_preflop(history):
    """
    ハンド履歴からプリフロップ部分を抽出する

    Returns:
        str: プリフロップ部分のテキスト。抽出できない場合は None
    """
    import re
    if "*** FLOP ***" in history:
        matches = re.findall(rf'posts big blind \d+([\s\S]*?)\*\*\* [FS]', history)
        if matches:
            return matches[0]
    else:
        # wins がある場合
        matches = re.findall(rf'posts big blind \d+([\s\S]*? wins \d*)', history)
        if matches:
            return matches[0]
        # wins がない不完全なハンド（ゲーム中断など）の場合
        # big blind post 以降の全てをプリフロップとして扱う
        matches = re.findall(rf'posts big blind \d+([\s\S]*)', history)
        if matches:
            return matches[0]
    return None

def extract_flop(history):
    """
    ハンド履歴からフロップ部分を抽出する

    Returns:
        str: フロップ部分のテキスト。フロップがない場合は False
    """
    if "*** FLOP ***" not in history:
        return False

    if "*** TURN ***" in history:
        matches = re.findall(rf'(\*\*\* FLOP \*\*\*[\s\S]*?)\*\*\* [TS]', history)
        if matches:
            return matches[0]
    else:
        # wins がある場合
        matches = re.findall(rf'(\*\*\* FLOP \*\*\*[\s\S]*? wins \d*)', history)
        if matches:
            return matches[0]
        # wins がない不完全なハンド（ゲーム中断など）
        matches = re.findall(rf'(\*\*\* FLOP \*\*\*[\s\S]*)', history)
        if matches:
            return matches[0]
    return False

def extract_turn(history):
    """
    ハンド履歴からターン部分を抽出する

    Returns:
        str: ターン部分のテキスト。ターンがない場合は False
    """
    if "*** TURN ***" not in history:
        return False

    if "*** RIVER ***" in history:
        matches = re.findall(rf'(\*\*\* TURN \*\*\*[\s\S]*?)\*\*\* [RS]', history)
        if matches:
            return matches[0]
    else:
        # wins がある場合
        matches = re.findall(rf'(\*\*\* TURN \*\*\*[\s\S]*? wins \d*)', history)
        if matches:
            return matches[0]
        # wins がない不完全なハンド（ゲーム中断など）
        matches = re.findall(rf'(\*\*\* TURN \*\*\*[\s\S]*)', history)
        if matches:
            return matches[0]
    return False

def extract_river(history):
    """
    ハンド履歴からリバー部分を抽出する

    Returns:
        str: リバー部分のテキスト。リバーがない場合は False
    """
    if "*** RIVER ***" not in history:
        return False

    # wins がある場合
    matches = re.findall(rf'(\*\*\* RIVER \*\*\*[\s\S]*? wins \d*)', history)
    if matches:
        return matches[0]
    # wins がない不完全なハンド（ゲーム中断など）
    matches = re.findall(rf'(\*\*\* RIVER \*\*\*[\s\S]*)', history)
    if matches:
        return matches[0]
    return False


# VPIP を計算する
def vpip_add(history, player):
    # preflop 内でのそのプレイヤーのアクションが folds のみ、もしくは checks のみの場合は、VPIP にカウントしない
    preflop = extract_preflop(history)
    if preflop is None:
        return False
    escape_player = re.escape(player)
    actions = re.findall(rf'{escape_player}: (.*?)\n', preflop)
    if actions == ["folds"] or actions == ["checks"]:
        return False
    else:
        return True

def calculate_vpip(histories: list, player: str):
    vpip = 0
    hands = 0
    for history in histories:
        # シート情報からプレイヤーの参加を判定
        seated_players = re.findall(r"seat \d+: (.*?) \(\d+ in chips\)", history)
        if player in seated_players:
            hands += 1
            if vpip_add(history, player):
                vpip += 1
    if hands == 0:
        return 0, 0, 0
    return round(vpip / hands * 100, 2), hands, int(vpip)

# 3bet 率を計算する
def three_bet_add(history, player):
    # 前に raise が入っているかどうか
    preflop = extract_preflop(history)
    if preflop is None:
        return False
    raise_num = 0
    all_actions = re.findall(rf'(.*?): (.*?)\n', preflop)
    for action in all_actions:
        if "raises" in action[1]:
            raise_num += 1
            if action[0] == player:
                if raise_num == 1:      # そのプレイヤーが original raiser
                    return False
                elif raise_num == 2:    # そのプレイヤーが 3bettor
                    return True
                else:
                    return False        # そのプレイヤーが 4bet 以上している
    return False
    
def calculate_three_bet(histories: list, player: str):
    three_bet = 0
    hands = 0
    for history in histories:
        preflop = extract_preflop(history)
        if preflop is None:
            continue
        all_actions = re.findall(rf'(.*?): (.*?)\n', preflop)
        raises = 0
        for action in all_actions:
            if action[0] == player and raises == 1:  # 2
                hands += 1
                #print(history)
                continue
            if "raises" in action[1]:
                raises += 1
        if three_bet_add(history, player):
            three_bet += 1
        else:
            continue
    if hands == 0:
        return 0, 0, 0
    else:
        return round(three_bet / hands * 100, 2), hands, int(three_bet)


# Fold to 3bet を計算する

def original_raiser(history):
    preflop = extract_preflop(history)
    if preflop is None:
        return False
    actions = re.findall(rf'(.*?): (.*?)\n', preflop)
    for action in actions:
        if "raises" in action[1]:
            return action[0]
    return False

def last_aggressor(history):
    preflop = extract_preflop(history)
    if preflop is None:
        return False
    actions = re.findall(rf'(.*?): (.*?)\n', preflop)
    agressor = ""
    for action in actions:
        if "raises" in action[1]:
            agressor = action[0]
    if agressor != "":
        return agressor
    else:
        return False

# 3betに対してfoldした割合を計算する
# 定義：自分がoriginal_raiserのとき、他プレイヤーが3betし、それ以外のプレイヤーがraiseしない状況で自分にアクションが戻ってきたハンド数のうち、
#      その場面でfoldを選択したハンド数の割合
def calculate_fold_to_three_bet(histories: list, player: str):
    fold_to_three_bet = 0
    hands = 0
    for history in histories:
        preflop = extract_preflop(history)
        if preflop is None:
            continue

        # 自分がoriginal raiserでない場合はスキップ
        if original_raiser(history) != player:
            continue

        all_actions = re.findall(rf'(.*?): (.*?)\n', preflop)

        raise_count = 0
        waiting_for_hero_action = False

        for actor, act in all_actions:
            if "raises" in act:
                raise_count += 1
                if raise_count == 2:
                    # 3betが発生、自分のアクションを待つ
                    waiting_for_hero_action = True
                elif raise_count >= 3:
                    # 4bet以上が発生、3betに対するアクション機会は終了
                    waiting_for_hero_action = False

            # 3bet後、4bet前に自分にアクションが回ってきた場合
            if waiting_for_hero_action and actor == player:
                hands += 1
                if "folds" in act:
                    fold_to_three_bet += 1
                break  # このハンドの処理は終了

    if hands == 0:
        return 0, 0, 0
    else:
        return round(fold_to_three_bet / hands * 100, 2), hands, fold_to_three_bet
            

# 各ポジションに誰が座っているかを取得する
def get_position(history: str) -> dict:
    preaction = re.findall(r"([\s\S]*?)\*\*\* HOLE CARDS \*\*\*", history)[0]
    players = re.findall(r"seat \d*: (.*?) \(", preaction)
    positions = ["UTG", "HJ", "CO", "BTN"]
    additional_positions = ["UTG+1", "UTG+2", "LJ"]
    if 6 >= len(players) >= 3:
        positions = positions[-(len(players)-2):]
    elif len(players) == 2:
        positions = ["SB", "BB"]
    elif 9 >= len(players) >= 7:
        positions = ["UTG"] + additional_positions[:len(players)-6] + ["HJ", "CO", "BTN", "SB", "BB"]
    else:
        raise ValueError("プレイヤー数が不正です。(9人以下にしてください。)")
    sb_player = re.findall(r"(.*?): posts small blind", preaction)[0]
    bb_player = re.findall(r"(.*?): posts big blind", preaction)[0]
    position_dict = {sb_player: "SB", bb_player: "BB"}
    if len(players) >= 3:
        bb_player_index = players.index(bb_player)
        for i in range(len(players)-2):
            position_dict[players[(bb_player_index+1+i)%len(players)]] = positions[i]
    return position_dict

def get_stack(history: str) -> dict:
    stacks = re.findall(r"seat \d*: (.*?) \((.*?) in chips\)", history)
    dict_stack = {}
    for player_chip in stacks:
        dict_stack[player_chip[0]] = player_chip[1]
    return dict_stack

def get_winner(history: str) -> str:
    winner = re.findall(r"(.*): wins \d*", history)[0]
    return winner

def get_last_street(history: str) -> list:
    if extract_river(history):
        return ["flop", "turn", "river"]
    elif extract_turn(history):
        return ["flop", "turn"]
    elif extract_flop(history):
        return ["flop"]
    else:
        return []



# CB 頻度を計算する。

def cb_add(history, player):
    if extract_preflop(history) and last_aggressor(history) == player:  # original_raiser(history) == player and 
        if extract_flop(history):           # flop が開いた場合
            #hands += 1
            flop = extract_flop(history)
            escape_player = re.escape(player)
            if len(re.findall(rf'{escape_player}: (.*?)[ \n]', flop)) > 0:         # all-in の時。actionは表示されない。
                #print(player, flop)
                actions = re.findall(rf'{escape_player}: (.*?)[ \n]', flop)[0]     # flop での最初のアクションを取得
                if actions == "bets":
                    return True
            #elif actions == "calls" or actions == "raises":     # donk を打たれた時は対象ハンドから除外(最初のアクションについて見ているので、CB に続く 3bet はここにはカウントされない。)
                #hands -= 1
    else:
        return False

def donk_flop(history):
    if last_aggressor(history) != False and extract_flop(history):
        flop = extract_flop(history)
        if len(re.findall(rf'{last_aggressor(history)}: (.*?)[ \n]', flop)) > 0:         # all-in の時。actionは表示されない。
            action = re.findall(rf'{last_aggressor(history)}: (.*?)[ \n]', flop)[0]     # flop での最初のアクションを取得
            if action in ["calls", "raises", "folds"]:
                return True
            else:
                return False
    else:
        return False

def calculate_cb(histories: list, player: str):
    cb = 0
    hands = 0
    for history in histories:
        if last_aggressor(history) == player and extract_flop(history):           # flop が開いた場合
            hands += 1
            if donk_flop(history):
                hands -= 1
        if cb_add(history, player):
            cb += 1
        else:
            continue
    if hands == 0:
        return 0, 0, 0
    else:
        return round(cb / hands * 100, 2), hands, int(cb)



def extract_street_survivor(street):
    survivors = []
    removed_actions = ["wins", "shows"]
    if street:  
        players = list(set(re.findall(r"(.*?): .*?", street)))
        for player in players:
            escape_player = re.escape(player)
            actions = re.findall(rf"{escape_player}: (.*?)[ \n]", street)
            for removed_action in removed_actions:
                if removed_action in actions:
                    actions.remove(removed_action)
            if "folds" not in actions:
                survivors.append(player)
        if len(survivors) >= 2:
            return survivors
        else:
            return []
    return []
    

# PFR を計算する

def calculate_pfr(histories: list, player: str):
    hands = 0
    pfr = 0
    for history in histories:
        preflop = extract_preflop(history)
        if preflop is None:
            continue
        escape_player = re.escape(player)
        actions_hero = re.findall(rf'{escape_player}: (.*?)[ \n]', preflop)
        if len(actions_hero) > 0:
            hands += 1
            if "raises" in actions_hero:
                pfr += 1
        else:
            continue
    if hands == 0:
        return 0, 0, 0
    else:
        return round(pfr / hands * 100, 2), hands, int(pfr)


# WTSD を計算する
# フロップに参加した上でshow downまで到達する割合

def calculate_wtsd_wdsd(histories: list, player: str):
    wtsd = 0
    wdsd = 0
    hands = 0
    for history in histories:
        if extract_flop(history):
            preflop = extract_preflop(history)
            if preflop is None:
                continue
            if player in extract_street_survivor(preflop):
                hands += 1
                river = extract_river(history)
                if river and player in extract_street_survivor(river):
                    wtsd += 1
                    if player + ": wins " in history:   # chop になった場合も含めるので
                        wdsd += 1

        else:
            continue
    if hands == 0:
        return 0, 0, 0, 0, 0
    elif wtsd == 0:
        return round(wtsd / hands * 100, 2), hands, int(wtsd), 0, 0
    else:
        return round(wtsd / hands * 100, 2), hands, int(wtsd), round(wdsd / int(wtsd) * 100, 2), wdsd

if __name__ == "__main__":
    print("hand_analysis module loaded successfully")