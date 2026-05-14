import { useCallback, useMemo, useState } from "react";

export const GAME_FLOW_PHASES = {
  SETUP: "setup",
  COUNTDOWN: "countdown",
  RUNNING: "running",
  FINISHED: "finished",
};

const useGameFlow = (initialPhase = GAME_FLOW_PHASES.SETUP) => {
  const [phase, setPhase] = useState(initialPhase);

  const goToSetup = useCallback(() => setPhase(GAME_FLOW_PHASES.SETUP), []);
  const startCountdown = useCallback(() => setPhase(GAME_FLOW_PHASES.COUNTDOWN), []);
  const startRunning = useCallback(() => setPhase(GAME_FLOW_PHASES.RUNNING), []);
  const finishGame = useCallback(() => setPhase(GAME_FLOW_PHASES.FINISHED), []);

  const flags = useMemo(
    () => ({
      isSetup: phase === GAME_FLOW_PHASES.SETUP,
      isCountdown: phase === GAME_FLOW_PHASES.COUNTDOWN,
      isRunning: phase === GAME_FLOW_PHASES.RUNNING,
      isFinished: phase === GAME_FLOW_PHASES.FINISHED,
    }),
    [phase]
  );

  return {
    phase,
    ...flags,
    setPhase,
    goToSetup,
    startCountdown,
    startRunning,
    finishGame,
  };
};

export default useGameFlow;
