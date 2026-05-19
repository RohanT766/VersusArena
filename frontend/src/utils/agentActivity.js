/** Format agent tool-call trace for UI status lines. */

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
    if (name === 'place_bid') return 'Placing bid…';
    if (name === 'take_action') return 'Acting…';
    if (name === 'place_ships') return 'Placing ships…';
    return `${name}…`;
  });
  return labels[labels.length - 1] || 'Thinking…';
}

export function agentThinkingLabel(busy, activity) {
  if (!busy) return null;
  return activity || 'Agent thinking…';
}
