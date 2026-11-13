export interface RandomSnapshot {
  algorithm: 'hardhit-lcg32-v1';
  state: number;
}

/** Small serializable source for repeatable local simulations and replay fixtures. */
export class SeededRandom {
  private state: number;

  constructor(seedOrSnapshot: number | RandomSnapshot) {
    if (typeof seedOrSnapshot === 'number') {
      this.state = seedOrSnapshot >>> 0;
    } else {
      if (seedOrSnapshot.algorithm !== 'hardhit-lcg32-v1' || !Number.isInteger(seedOrSnapshot.state)) {
        throw new Error('Unsupported random snapshot');
      }
      this.state = seedOrSnapshot.state >>> 0;
    }
  }

  public next = (): number => {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  };

  public snapshot(): RandomSnapshot {
    return { algorithm: 'hardhit-lcg32-v1', state: this.state };
  }
}
