"""Unit tests for new game modules (no LLM)."""

from src.games import minesweeper, auction, poker


def test_minesweeper_board_generation():
    board, mines = minesweeper.generate_board(8, 8, 10)
    assert len(board) == 8
    assert len(mines) == 10


def test_minesweeper_session_state():
    sess = minesweeper.start_session("a", "b")
    st = minesweeper.session_state(sess)
    assert st["session_id"] == sess.id
    assert st["mine_count"] == 10


def test_auction_rounds():
    sess = auction.start_session("a", "b")
    assert len(sess.rounds) == auction.ROUNDS


def test_poker_winner_side():
    sess = poker.start_session("a", "b")
    sess.chips_p1 = 1200
    sess.chips_p2 = 800
    assert poker.winner_side(sess) == 1


def test_poker_heads_up_action_order():
    assert poker._action_order("player1", "preflop") == ["player1", "player2"]
    assert poker._action_order("player1", "flop") == ["player2", "player1"]


def test_poker_start_hand_deal_steps():
    sess = poker.start_session("a", "b")
    r1 = poker.advance_step(sess)
    assert r1["step"]["type"] == "deal_hole"
    assert len(r1["hole_p1"]) + len(r1["hole_p2"]) == 1
    for _ in range(3):
        poker.advance_step(sess)
    r4 = poker.advance_step(sess)
    assert len(r4["hole_p1"]) == 2 and len(r4["hole_p2"]) == 2
