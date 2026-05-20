/**
 * Standard arena messaging for all live games.
 *
 * Header (GameLayout statusText): game phase only — round/hand, street, puzzle id.
 *   Never agent thinking, never raw player1/player2.
 *
 * Seat (PlayerThinking): per-model activity while that agent runs.
 *   Parallel games: multiple seats can show thinking at once.
 *   Turn-based: only the active side.
 *
 * Feed (GameActionFeed): completed actions with display names; bottom overlay.
 */

export function arenaPlayerLabel(side, p1Name, p2Name) {
  if (side == null) return '';
  const s = String(side).toLowerCase();
  if (s === 'player1' || s === '1' || s === 'p1' || s === 'model1') return p1Name;
  if (s === 'player2' || s === '2' || s === 'p2' || s === 'model2') return p2Name;
  return String(side);
}

export function arenaPlayerSide(side) {
  if (side == null) return null;
  const s = String(side).toLowerCase();
  if (s === 'player1' || s === '1' || s === 'p1' || s === 'model1') return 'player1';
  if (s === 'player2' || s === '2' || s === 'p2' || s === 'model2') return 'player2';
  return null;
}

/** Tool-call trace → short status under a player seat. */
export function formatAgentActivity(stepOrUsage) {
  const calls = stepOrUsage?.tool_calls || stepOrUsage?.step?.tool_calls;
  if (!calls?.length) return null;
  const labels = calls.map((c) => {
    const name = c.name || 'tool';
    if (name === 'get_board_view' || name === 'get_board_state') return 'Checking board…';
    if (name === 'get_feedback_history') return 'Reviewing guesses…';
    if (name === 'get_remaining_words') return 'Scanning words…';
    if (name === 'get_found_groups') return 'Reviewing groups…';
    if (name === 'get_auction_state' || name === 'get_hand_state') return 'Reviewing state…';
    if (name === 'fire_shot') return 'Firing…';
    if (name === 'reveal_cell') return 'Revealing cell…';
    if (name === 'submit_guess') return 'Submitting guess…';
    if (name === 'submit_group') return 'Submitting group…';
    if (name === 'place_bid' || name === 'auction_action') return 'Bidding…';
    if (name === 'take_action') return 'Acting…';
    if (name === 'place_ships') return 'Placing ships…';
    return `${name}…`;
  });
  return labels[labels.length - 1] || null;
}

export function thinkingText(activity) {
  return activity || 'Thinking…';
}

/** @deprecated use thinkingText — kept for old call sites */
export function agentThinkingLabel(busy, activity) {
  if (!busy) return null;
  return thinkingText(activity);
}

/**
 * One line for the action feed.
 * @param {{ side: string|number, p1Name: string, p2Name: string, text?: string, verb?: string, detail?: string }} opts
 */
export function formatActionLine({ side, p1Name, p2Name, text, verb, detail }) {
  if (text) return text;
  const name = arenaPlayerLabel(side, p1Name, p2Name);
  if (!verb) return name;
  return detail != null && detail !== '' ? `${name} ${verb} ${detail}` : `${name} ${verb}`;
}

/** Build feed entry objects from raw action logs. */
export function toActionFeedItem(side, p1Name, p2Name, verb, detail) {
  return {
    side: arenaPlayerSide(side) || side,
    text: formatActionLine({ side, p1Name, p2Name, verb, detail }),
  };
}
