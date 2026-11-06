import { newDeck, type Card } from "../../engine";
import { rigDeck } from "../../engine/__tests__/helpers";
import * as rules from "../room";
import type { RoomCtx, RoomSettings, RoomState } from "../types";

export const T0 = 1_000_000;

/** Controllable clock, deck and ids for pure room tests. */
export class TestCtx {
  now = T0;
  private n = 0;
  nextDeck: Card[] | null = null;

  get ctx(): RoomCtx {
    return {
      now: this.now,
      newDeck: () => {
        const d = this.nextDeck ?? newDeck();
        this.nextDeck = null;
        return d;
      },
      newId: () => `u${++this.n}`,
    };
  }

  /** Next hand: player i (in seat order) gets holes[i]. */
  rig(holes: Card[][], board: Card[] = []) {
    this.nextDeck = rigDeck(holes, board);
  }
}

/** Room with players joined and seated at seats 0..n-1. First player is host. */
export function table(
  t: TestCtx,
  names: string[] = ["Ann", "Bo", "Cy"],
  settings?: Partial<RoomSettings>,
): { r: RoomState; ids: string[] } {
  let { room: r, playerId } = rules.createRoom(t.ctx, {
    code: "ABCDEF",
    hostName: names[0]!,
    tokenHash: `hash-${names[0]}`,
    settings,
  });
  const ids = [playerId];
  for (const name of names.slice(1)) {
    const j = rules.join(r, t.ctx, { name, tokenHash: `hash-${name}` });
    r = j.room;
    ids.push(j.playerId);
  }
  ids.forEach((id, seat) => (r = rules.sit(r, t.ctx, id, seat)));
  return { r, ids };
}

export const turnId = (r: RoomState) => (r.hand && r.hand.toAct !== null ? r.hand.players[r.hand.toAct]!.id : null);

let actionCounter = 0;
export const nextActionId = () => `a${++actionCounter}`;
