"""Unit tests for new game modules (no LLM)."""

from src.games import minesweeper, auction, poker


def test_minesweeper_board_generation():
    board, mines = minesweeper.generate_board(8, 8, 10)
    assert len(board) == 8
    assert len(mines) == 10


def test_minesweeper_play_round_structure():
    sess = minesweeper.start_session("a", "b")
    st = minesweeper.play_round(sess)
    assert "round" in st
    assert "player1" in st or "player2" in st.get("round", {})


def test_minesweeper_session_state():
    sess = minesweeper.start_session("a", "b")
    st = minesweeper.session_state(sess)
    assert st["session_id"] == sess.id
    assert st["mine_count"] == 10


def test_auction_rounds():
    sess = auction.start_session("a", "b")
    assert len(sess.items) == auction.ROUNDS


def test_auction_sequential_pass_wins():
    sess = auction.start_session("a", "b")
    live = auction._start_live(sess)
    auction._apply_action(sess, live, "player1", "bid", 50)
    assert live.high_bidder == "player1"
    status, rec = auction._apply_action(sess, live, "player2", "pass", 0)
    assert status == "settled"
    assert rec["winner"] == "player1"
    assert sess.budget_p1 == auction.STARTING_BUDGET - 50


def test_auction_double_pass_no_winner():
    sess = auction.start_session("a", "b")
    live = auction._start_live(sess)
    auction._apply_action(sess, live, "player1", "pass", 0)
    status, rec = auction._apply_action(sess, live, "player2", "pass", 0)
    assert status == "settled"
    assert rec["winner"] is None


def test_poker_winner_side():
    sess = poker.start_session("a", "b")
    sess.chips_p1 = 1200
    sess.chips_p2 = 800
    assert poker.winner_side(sess) == 1


def test_poker_two_player_action_order():
    assert poker._action_order("player1", "preflop") == ["player1", "player2"]
    assert poker._action_order("player1", "flop") == ["player2", "player1"]


def test_poker_two_player_meta():
    sess = poker.start_session("a", "b")
    hand = poker._start_hand(sess)
    meta = poker._two_player_meta(hand)
    assert meta["format"] == "two_player_holdem"
    assert meta["sb_player"] == hand.button
    assert meta["bb_player"] == poker._other(hand.button)


def test_poker_street_chip_rack_on_bet():
    from src.games.poker_chips import rack_total

    sess = poker.start_session("a", "b")
    hand = poker.HandState(deck=[])
    moved, chips_moved = poker._apply_pay(sess, hand, "player1", 5)
    assert moved == 5
    assert sum(int(v) for v in chips_moved.values()) >= 1
    assert rack_total(sess.pot_rack) == 0
    assert rack_total(hand.street_chip_racks["player1"]) == 5
    assert sess.chips_p1 == 995


def test_poker_merge_street_to_pot():
    from src.games.poker_chips import rack_total

    sess = poker.start_session("a", "b")
    hand = poker.HandState(deck=[])
    poker._apply_pay(sess, hand, "player1", 10)
    poker._apply_pay(sess, hand, "player2", 20)
    poker._merge_street_to_pot(sess, hand)
    assert rack_total(sess.pot_rack) == 30
    assert rack_total(hand.street_chip_racks["player1"]) == 0
    assert rack_total(hand.street_chip_racks["player2"]) == 0


def test_poker_start_hand_deal_steps():
    sess = poker.start_session("a", "b")
    r1 = poker.advance_step(sess)
    assert r1["step"]["type"] == "deal_hole"
    assert len(r1["hole_p1"]) + len(r1["hole_p2"]) == 1
    for _ in range(3):
        poker.advance_step(sess)
    r4 = poker.advance_step(sess)
    assert len(r4["hole_p1"]) == 2 and len(r4["hole_p2"]) == 2
