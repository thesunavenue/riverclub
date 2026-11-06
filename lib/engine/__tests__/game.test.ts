import { describe, expect, it } from "vitest";
import { applyAction, legalActions, nextButtonSeat, startHand, timeoutAction, totalChips } from "../game";
import { newDeck } from "../cards";
import { EngineError } from "../types";
import { play, stacks, start, toActId } from "./helpers";

const AA = ["As", "Ah"];
const KK = ["Ks", "Kh"];
const QQ = ["Qs", "Qh"];
const LOW = ["4c", "5c"];
const DRY_BOARD = ["2c", "7d", "9h", "Jc", "3d"];

function expectError(fn: () => unknown, code: EngineError["code"]) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe(code);
    return;
  }
  throw new Error(`Expected EngineError ${code}`);
}

describe("setup validation", () => {
  it("rejects bad tables", () => {
    expectError(() => start([1000]), "INVALID_SETUP");
    expectError(() => start(Array(10).fill(1000), { seats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }), "INVALID_SETUP");
    expectError(() => start([1000, 1000], { seats: [3, 3] }), "INVALID_SETUP");
    expectError(() => start([1000, 0]), "INVALID_SETUP");
    expectError(() => start([1000, 1000], { button: 5 }), "INVALID_SETUP");
    expectError(() => start([1000, 1000], { sb: 30, bb: 20 }), "INVALID_SETUP");
    const deck = newDeck();
    deck[51] = deck[0]!;
    expectError(
      () =>
        startHand({
          handNumber: 1,
          players: [
            { id: "a", seat: 0, stack: 100 },
            { id: "b", seat: 1, stack: 100 },
          ],
          buttonSeat: 0,
          smallBlind: 1,
          bigBlind: 2,
          deck,
        }),
      "INVALID_SETUP",
    );
  });

  it("deals two unique cards per player and keeps them off the board", () => {
    const s = start([1000, 1000, 1000, 1000]);
    const all = [...s.players.flatMap((p) => p.hole), ...s.deck];
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
  });
});

describe("heads-up", () => {
  it("button posts small blind and acts first preflop, big blind acts first after", () => {
    let s = start([1000, 1000], { button: 0 });
    expect(s.smallBlindSeat).toBe(0);
    expect(s.bigBlindSeat).toBe(1);
    expect(stacks(s)).toEqual([990, 980]);
    expect(toActId(s)).toBe("p0");
    s = play(s, ["p0 call"]);
    // Big blind gets the option.
    expect(toActId(s)).toBe("p1");
    expect(legalActions(s)).toMatchObject({ canCheck: true, canRaise: true });
    s = play(s, ["p1 check"]);
    expect(s.street).toBe("flop");
    expect(s.board).toHaveLength(3);
    expect(toActId(s)).toBe("p1");
    s = play(s, ["p1 check", "p0 check"]);
    expect(s.street).toBe("turn");
    expect(toActId(s)).toBe("p1");
  });

  it("short small blind all-in runs the board out and returns the unmatched part", () => {
    const s = start([5, 1000], { holes: [AA, KK], board: DRY_BOARD });
    expect(s.street).toBe("complete");
    expect(s.board).toHaveLength(5);
    expect(s.result!.pots.map((p) => p.amount)).toEqual([10, 15]);
    expect(stacks(s)).toEqual([10, 995]);
  });

  it("short big blind all-in: small blind does not need to add more", () => {
    const s = start([1000, 5], { holes: [KK, AA], board: DRY_BOARD });
    expect(s.street).toBe("complete");
    expect(s.result!.pots.map((p) => p.amount)).toEqual([10, 5]);
    expect(stacks(s)).toEqual([995, 10]);
  });
});

describe("turn order", () => {
  it("3-handed: button acts first preflop, small blind first postflop", () => {
    let s = start([1000, 1000, 1000], { button: 0 });
    expect(s.smallBlindSeat).toBe(1);
    expect(s.bigBlindSeat).toBe(2);
    expect(toActId(s)).toBe("p0");
    s = play(s, ["p0 call", "p1 call"]);
    expect(toActId(s)).toBe("p2");
    expect(legalActions(s)!.canCheck).toBe(true);
    s = play(s, ["p2 check"]);
    expect(s.street).toBe("flop");
    expect(toActId(s)).toBe("p1");
  });

  it("6-handed with button in the middle", () => {
    const s = start([1000, 1000, 1000, 1000, 1000, 1000], { button: 3 });
    expect(s.smallBlindSeat).toBe(4);
    expect(s.bigBlindSeat).toBe(5);
    expect(toActId(s)).toBe("p0");
  });

  it("works with gaps between seats", () => {
    let s = start([1000, 1000, 1000], { seats: [1, 4, 7], button: 7 });
    expect(s.smallBlindSeat).toBe(1);
    expect(s.bigBlindSeat).toBe(4);
    expect(toActId(s)).toBe("p2"); // seat 7
    s = play(s, ["p2 call", "p0 call", "p1 check"]);
    expect(toActId(s)).toBe("p0"); // seat 1, first after the button
  });

  it("skips folded and all-in players", () => {
    let s = start([1000, 1000, 1000, 50], { button: 0 });
    // Order preflop: p3, p0, p1, p2
    s = play(s, ["p3 raise 50", "p0 fold", "p1 call", "p2 call"]);
    expect(s.street).toBe("flop");
    expect(toActId(s)).toBe("p1");
    s = play(s, ["p1 check"]);
    expect(toActId(s)).toBe("p2");
  });

  it("rejects actions out of turn and after the hand", () => {
    let s = start([1000, 1000, 1000]);
    expectError(() => applyAction(s, "p1", { type: "fold" }), "NOT_YOUR_TURN");
    expectError(() => applyAction(s, "nobody", { type: "fold" }), "NOT_YOUR_TURN");
    s = play(s, ["p0 fold", "p1 fold"]);
    expectError(() => applyAction(s, "p2", { type: "check" }), "HAND_OVER");
  });

  it("rejects check when facing a bet and call when nothing to call", () => {
    let s = start([1000, 1000, 1000]);
    expectError(() => applyAction(s, "p0", { type: "check" }), "ILLEGAL_ACTION");
    s = play(s, ["p0 call", "p1 call"]);
    expectError(() => applyAction(s, "p2", { type: "call" }), "ILLEGAL_ACTION");
    expectError(() => applyAction(s, "p2", { type: "dance" } as never), "ILLEGAL_ACTION");
  });
});

describe("min-raise", () => {
  it("enforces min raise and tracks the last raise size", () => {
    let s = start([1000, 1000, 1000]);
    expect(legalActions(s)).toMatchObject({ minRaiseTo: 40, maxRaiseTo: 1000, callAmount: 20 });
    expectError(() => applyAction(s, "p0", { type: "raise", to: 39 }), "INVALID_AMOUNT");
    expectError(() => applyAction(s, "p0", { type: "raise", to: 1001 }), "INVALID_AMOUNT");
    expectError(() => applyAction(s, "p0", { type: "raise", to: 45.5 }), "INVALID_AMOUNT");
    expectError(() => applyAction(s, "p0", { type: "raise", to: "100" as never }), "INVALID_AMOUNT");
    s = play(s, ["p0 raise 40"]);
    expect(legalActions(s)!.minRaiseTo).toBe(60);
    s = play(s, ["p1 raise 100"]); // raise by 60
    expect(legalActions(s)!.minRaiseTo).toBe(160);
    expectError(() => applyAction(s, "p2", { type: "raise", to: 159 }), "INVALID_AMOUNT");
  });

  it("minimum bet postflop is the big blind", () => {
    let s = start([1000, 1000, 1000]);
    s = play(s, ["p0 call", "p1 call", "p2 check"]);
    expect(legalActions(s)).toMatchObject({ canCheck: true, minRaiseTo: 20 });
    expectError(() => applyAction(s, "p1", { type: "raise", to: 19 }), "INVALID_AMOUNT");
    s = play(s, ["p1 raise 20"]);
    expect(legalActions(s)!.minRaiseTo).toBe(40);
  });

  it("allows an all-in for less than a min raise", () => {
    let s = start([1000, 1000, 1000, 50]);
    expect(legalActions(s)).toMatchObject({ minRaiseTo: 40, maxRaiseTo: 50 });
    s = play(s, ["p3 call", "p0 raise 40", "p1 fold", "p2 fold"]);
    // Full min-raise would be to 60, but p3 only has 50 total.
    expect(legalActions(s)).toMatchObject({ playerId: "p3", canRaise: true, minRaiseTo: 50, maxRaiseTo: 50 });
    s = play(s, ["p3 raise 50"]);
    expect(legalActions(s)).toMatchObject({ playerId: "p0", canRaise: false, callAmount: 10 });
    s = play(s, ["p0 call"]);
    expect(s.street).toBe("complete");
    expect(totalChips(s)).toBe(3050);
  });

  it("an incomplete all-in raise does not reopen betting for players who already acted", () => {
    let s = start([130, 1000, 1000, 1000], { button: 0 });
    s = play(s, ["p3 raise 100", "p0 raise 130", "p1 fold"]);
    // p2 (big blind) has not acted yet, so may raise.
    expect(legalActions(s)).toMatchObject({ playerId: "p2", canRaise: true, minRaiseTo: 210 });
    s = play(s, ["p2 call"]);
    expect(legalActions(s)).toMatchObject({ playerId: "p3", canRaise: false, canCall: true, callAmount: 30 });
    expectError(() => applyAction(s, "p3", { type: "raise", to: 300 }), "ILLEGAL_ACTION");
    s = play(s, ["p3 call"]);
    expect(s.street).toBe("flop");
  });

  it("several all-ins that add up to a full raise do reopen betting", () => {
    let s = start([200, 1000, 1000, 1000, 150], { button: 0 });
    s = play(s, ["p3 raise 100", "p4 raise 150", "p0 raise 200", "p1 fold", "p2 call"]);
    expect(legalActions(s)).toMatchObject({ playerId: "p3", canRaise: true, minRaiseTo: 280 });
  });

  it("no raising when every opponent is all-in", () => {
    let s = start([1000, 300, 1000]);
    s = play(s, ["p0 fold", "p1 raise 300"]);
    expect(legalActions(s)).toMatchObject({ playerId: "p2", canRaise: false, canCall: true, callAmount: 280 });
  });
});

describe("side pots and all-in", () => {
  it("three different stacks all-in", () => {
    let s = start([100, 300, 1000], { holes: [AA, KK, QQ], board: DRY_BOARD });
    s = play(s, ["p0 raise 100", "p1 raise 300", "p2 call"]);
    expect(s.street).toBe("complete");
    expect(s.board).toEqual(DRY_BOARD);
    expect(s.result!.pots).toEqual([
      { amount: 300, eligible: ["p0", "p1", "p2"], winners: ["p0"] },
      { amount: 400, eligible: ["p1", "p2"], winners: ["p1"] },
    ]);
    expect(stacks(s)).toEqual([300, 400, 700]);
  });

  it("four levels of all-in, uncalled chips returned", () => {
    let s = start([50, 150, 300, 1000], { holes: [AA, KK, QQ, LOW], board: DRY_BOARD });
    s = play(s, ["p3 raise 1000", "p0 call", "p1 call", "p2 call"]);
    expect(s.result!.pots.map((p) => [p.amount, p.winners])).toEqual([
      [200, ["p0"]],
      [300, ["p1"]],
      [300, ["p2"]],
      [700, ["p3"]],
    ]);
    expect(stacks(s)).toEqual([200, 300, 300, 700]);
  });

  it("biggest stack wins everything", () => {
    let s = start([50, 150, 300, 1000], { holes: [LOW, KK, QQ, AA], board: DRY_BOARD });
    s = play(s, ["p3 raise 1000", "p0 call", "p1 call", "p2 call"]);
    expect(stacks(s)).toEqual([0, 0, 0, 1500]);
  });

  it("folded player's chips stay in the pot but they cannot win", () => {
    let s = start([100, 1000, 1000], { holes: [AA, KK, QQ], board: DRY_BOARD });
    s = play(s, ["p0 raise 100", "p1 raise 300", "p2 call", "p1 raise 200", "p2 fold"]);
    expect(s.street).toBe("complete");
    expect(s.result!.pots).toEqual([
      { amount: 300, eligible: ["p0", "p1"], winners: ["p0"] },
      { amount: 600, eligible: ["p1"], winners: ["p1"] },
    ]);
    expect(stacks(s)).toEqual([300, 1100, 700]);
  });

  it("short big blind: others must still call the full big blind", () => {
    let s = start([1000, 1000, 15], { holes: [KK, QQ, AA], board: DRY_BOARD });
    expect(s.players[2]!.allIn).toBe(true);
    expect(legalActions(s)!.callAmount).toBe(20);
    s = play(s, ["p0 call", "p1 call"]);
    expect(s.street).toBe("flop");
    s = play(s, ["p1 check", "p0 check", "p1 check", "p0 check", "p1 check", "p0 check"]);
    expect(s.result!.pots.map((p) => [p.amount, p.winners])).toEqual([
      [45, ["p2"]],
      [10, ["p0"]],
    ]);
    expect(stacks(s)).toEqual([990, 980, 45]);
  });
});

describe("showdown and split pots", () => {
  it("splits when the board plays, odd chip goes to first seat left of the button", () => {
    const board = ["Tc", "Jd", "Qh", "Ks", "Ad"];
    let s = start([1000, 1000, 1000], {
      sb: 5,
      holes: [["2c", "3d"], ["4h", "5s"], ["6c", "7d"]],
      board,
    });
    s = play(s, ["p0 call", "p1 fold", "p2 check"]);
    s = play(s, ["p2 check", "p0 check", "p2 check", "p0 check", "p2 check", "p0 check"]);
    expect(s.result!.pots).toEqual([{ amount: 45, eligible: ["p0", "p2"], winners: ["p2", "p0"] }]);
    expect(s.result!.payouts).toEqual({ p0: 22, p1: 0, p2: 23 });
    expect(stacks(s)).toEqual([1002, 995, 1003]);
  });

  it("three-way split with odd chips", () => {
    const board = ["Tc", "Jd", "Qh", "Ks", "Ad"];
    let s = start([1000, 1000, 1000, 1000], {
      sb: 5,
      button: 0,
      holes: [["2c", "3d"], ["4h", "5s"], ["6c", "7d"], ["8c", "8d"]],
      board,
    });
    s = play(s, ["p3 call", "p0 call", "p1 fold", "p2 check"]);
    // Postflop: p2, p3, p0 check down.
    for (let i = 0; i < 3; i++) s = play(s, ["p2 check", "p3 check", "p0 check"]);
    // Pot 65 split three ways: 21 each + 2 odd chips to seats left of the button first (p2, p3).
    expect(s.result!.payouts).toEqual({ p0: 21, p1: 0, p2: 22, p3: 22 });
    expect(totalChips(s)).toBe(4000);
  });

  it("kicker decides, no split", () => {
    let s = start([1000, 1000], {
      holes: [["Ac", "Kd"], ["Ah", "Qd"]],
      board: ["As", "7d", "9h", "4c", "2s"],
    });
    s = play(s, ["p0 call", "p1 check"]);
    for (let i = 0; i < 3; i++) s = play(s, ["p1 check", "p0 check"]);
    expect(s.result!.pots[0]!.winners).toEqual(["p0"]);
    expect(s.result!.hands.p0!.category).toBe("pair");
    expect(stacks(s)).toEqual([1020, 980]);
  });

  it("everyone folds to one player: no showdown", () => {
    let s = start([1000, 1000, 1000]);
    s = play(s, ["p0 fold", "p1 fold"]);
    expect(s.street).toBe("complete");
    expect(s.result!.showdown).toBe(false);
    expect(s.result!.hands).toEqual({});
    expect(s.board).toEqual([]);
    expect(stacks(s)).toEqual([1000, 990, 1010]);
  });
});

describe("purity and helpers", () => {
  it("applyAction does not modify the input state", () => {
    const s = start([1000, 1000, 1000]);
    const before = JSON.stringify(s);
    applyAction(s, "p0", { type: "raise", to: 60 });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("timeoutAction checks when possible, otherwise folds", () => {
    let s = start([1000, 1000, 1000]);
    expect(timeoutAction(s)).toEqual({ type: "fold" });
    s = play(s, ["p0 call", "p1 call"]);
    expect(timeoutAction(s)).toEqual({ type: "check" });
    s = play(s, ["p2 check", "p1 fold", "p2 fold"]);
    expect(timeoutAction(s)).toBeNull();
  });

  it("nextButtonSeat moves clockwise and wraps", () => {
    expect(nextButtonSeat([2, 5, 7], null)).toBe(2);
    expect(nextButtonSeat([2, 5, 7], 2)).toBe(5);
    expect(nextButtonSeat([2, 5, 7], 6)).toBe(7);
    expect(nextButtonSeat([2, 5, 7], 7)).toBe(2);
  });
});

describe("rules chosen for the table", () => {
  it("postflop all-in bet below the big blind: call it, or raise by at least a big blind", () => {
    let s = start([1000, 1000, 1000, 30]);
    s = play(s, ["p3 call", "p0 call", "p1 call", "p2 check"]); // p3 has 10 left
    s = play(s, ["p1 check", "p2 check", "p3 raise 10"]);
    expect(s.players[3]!.allIn).toBe(true);
    expect(legalActions(s)).toMatchObject({ playerId: "p0", callAmount: 10, canRaise: true, minRaiseTo: 30 });
    // "Completing" to the big blind is not a legal raise here.
    expectError(() => applyAction(s, "p0", { type: "raise", to: 20 }), "INVALID_AMOUNT");
    s = play(s, ["p0 raise 30"]);
    expect(legalActions(s)!.minRaiseTo).toBe(50); // 30 + last full raise (20)
  });

  it("odd chip inside a side pot goes to the first winner left of the button", () => {
    const board = ["Tc", "Jd", "Qh", "Ks", "Ad"]; // everyone plays the board
    let s = start([1000, 25, 1000, 1000], {
      sb: 5,
      button: 0,
      holes: [["2c", "3d"], ["4h", "5s"], ["6c", "7d"], ["8c", "9s"]],
      board,
    });
    s = play(s, ["p3 call", "p0 call", "p1 call", "p2 check"]);
    // Flop: p1 shoves 5, p2 raises, p3 re-raises, p0 calls, p2 folds.
    s = play(s, ["p1 raise 5", "p2 raise 26", "p3 raise 47", "p0 call", "p2 fold"]);
    for (let i = 0; i < 2; i++) s = play(s, ["p3 check", "p0 check"]);
    expect(s.result!.pots).toEqual([
      { amount: 100, eligible: ["p0", "p1", "p3"], winners: ["p1", "p3", "p0"] },
      { amount: 105, eligible: ["p0", "p3"], winners: ["p3", "p0"] },
    ]);
    // Main 100 / 3 = 33 r1 -> p1. Side 105 / 2 = 52 r1 -> p3.
    expect(s.result!.payouts).toEqual({ p0: 85, p1: 34, p2: 0, p3: 86 });
    expect(totalChips(s)).toBe(3025);
  });

  it("logs the first bet of a street as 'bet' and later ones as 'raise'", () => {
    let s = start([1000, 1000, 1000]);
    s = play(s, ["p0 raise 60", "p1 call", "p2 call"]);
    s = play(s, ["p1 raise 40", "p2 raise 100"]);
    const types = s.log.map((e) => `${e.street}:${e.type}`);
    expect(types).toEqual([
      "preflop:small_blind",
      "preflop:big_blind",
      "preflop:raise",
      "preflop:call",
      "preflop:call",
      "flop:bet",
      "flop:raise",
    ]);
  });
});
