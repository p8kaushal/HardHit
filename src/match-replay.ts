import { MatchController } from './game';
import type { MatchHistoryRecord } from './match-history';

function assertSame(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Replay mismatch in ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Replay recorded manual-match delivery and shot inputs through current adjudication. */
export function replayMatchRecord(record: MatchHistoryRecord): MatchController {
  if (!record.setup || !Number.isFinite(record.seed) || record.events.length === 0) {
    throw new Error('Match record lacks replay setup, seed, or events');
  }
  if (record.events.some((event, index) => event.sequence !== index || !event.resolved)) {
    throw new Error('Match record has incomplete or out-of-order delivery events');
  }

  const game = new MatchController(record.setup.difficulty, record.seed);
  game.state.player = structuredClone(record.setup.player);
  game.state.bot = structuredClone(record.setup.bot);
  game.setTossResult(record.setup.tossWinnerId, record.setup.tossChoice);
  game.startMatch();
  // Replay should use the actual match rules without starting UI timers or
  // granting progression a second time.
  (game as any).handleInningsCompletion = () => {};

  for (const event of record.events) {
    while (game.state.currentInningsIndex < event.inningsIndex) {
      if (game.state.currentInningsIndex === 0) {
        game.state.currentInningsIndex = 1;
      } else if (game.state.currentInningsIndex === 1) {
        const next = record.events.find(candidate => candidate.inningsIndex === 2);
        if (!next) throw new Error('Replay record is missing sudden-death setup events');
        const random = Math.random;
        Math.random = () => next.batterId === record.setup!.player.id ? 0.75 : 0.25;
        try { (game as any).resolveMatch(false); } finally { Math.random = random; }
        if ((game.state.currentInningsIndex as number) !== 2 || !game.state.tieBreakerActive) {
          throw new Error('Replay expected sudden death, but regular innings did not tie');
        }
      } else if (game.state.currentInningsIndex === 2) {
        game.state.currentInningsIndex = 3;
      } else {
        throw new Error(`Unsupported replay innings transition from ${game.state.currentInningsIndex}`);
      }
    }
    if (game.state.currentInningsIndex !== event.inningsIndex) throw new Error('Replay event innings are not monotonic');
    const innings = game.getCurrentInnings();
    if (innings.batter.id !== event.batterId || innings.bowler.id !== event.bowlerId) {
      throw new Error(`Replay participant mismatch at event ${event.sequence}`);
    }

    const contactModel = event.contactModel ?? 'legacy-timing';
    const outcome = game.recordBall(event.delivery, event.shot, event.fieldPreset, contactModel);
    const expectedDecisionReason = event.runOutBy && event.extraType === 'noball'
      ? 'Front-foot no-ball! (Free hit next)'
      : event.caughtBy || event.runOutBy ? '' : event.wicketReason;
    const replayedDecision = game.state.events[game.state.events.length - 1];
    const expectedContact = event.batContact;
    const actualContact = replayedDecision.batContact;
    // Older swept-blade-v1 saves predate face coordinates and bat velocity.
    // Compare only fields present in the saved record so adding diagnostics
    // does not invalidate otherwise deterministic legacy replays.
    const replayedContact = expectedContact && actualContact
      ? Object.fromEntries(Object.keys(expectedContact).map(key => [key, (actualContact as unknown as Record<string, unknown>)[key]]))
      : actualContact;
    const usesSweptContact = contactModel === 'swept-blade-v1' || contactModel === 'swept-blade-v2' || contactModel === 'swept-blade-v3' || contactModel === 'swept-blade-v4';
    assertSame({ missed: outcome.missed ?? false, isWicket: outcome.isWicket, wicketReason: outcome.wicketReason, isFreeHit: outcome.isFreeHit, isExtra: outcome.isExtra, extraType: outcome.extraType, ...(usesSweptContact ? { batContact: replayedContact } : {}) },
      { missed: event.missed, isWicket: event.caughtBy || event.runOutBy ? false : event.isWicket, wicketReason: expectedDecisionReason, isFreeHit: event.isFreeHit, isExtra: event.isExtra, extraType: event.extraType, ...(usesSweptContact ? { batContact: event.batContact } : {}) }, `decision ${event.sequence}`);
    if (event.flight) {
      const runs = game.finalizeBallOutcome(event.distance, event.flight.hasBounced, event.flight.reachedBoundary, event.caughtBy, event.fieldedRuns, event.runOutBy, event.physicsEvents);
      assertSame(runs, event.runs, `flight score ${event.sequence}`);
    }
    const replayed = game.state.events[game.state.events.length - 1];
    assertSame({ distance: replayed.distance, runs: replayed.runs, resolved: replayed.resolved, isWicket: replayed.isWicket, wicketReason: replayed.wicketReason, runOutBy: replayed.runOutBy, fieldPreset: replayed.fieldPreset, physicsEvents: replayed.physicsEvents },
      { distance: event.distance, runs: event.runs, resolved: event.resolved, isWicket: event.isWicket, wicketReason: event.wicketReason, runOutBy: event.runOutBy, fieldPreset: event.fieldPreset, physicsEvents: event.physicsEvents }, `event ${event.sequence}`);
  }

  if (game.state.currentInningsIndex === 1 && game.getCurrentInnings().finished) {
    (game as any).resolveMatch(false);
  } else if ((game.state.currentInningsIndex === 2 || game.state.currentInningsIndex === 3) && game.getCurrentInnings().finished) {
    (game as any).resolveMatch(false);
  }
  const expectedOutcome = game.state.winnerId === record.setup.player.id ? 'WON' : game.state.winnerId === record.setup.bot.id ? 'LOST' : 'TIED';
  if (game.state.status === 'completed') assertSame(expectedOutcome, record.outcome, 'match result');
  return game;
}
