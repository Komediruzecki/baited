import gateway from '../../src/index.js';
import { ChannelRoom as BaseRoom } from '../../src/room.js';
import type { Game } from '@baited/game-core';

export default gateway;

/** Test-only RPC and fault injection. This module is never the deployed entry. */
export class ChannelRoom extends BaseRoom {
  private failNextSchedule = false;

  armFailure(): void {
    this.failNextSchedule = true;
  }

  async inspectFixture() {
    return {
      alarm: await this.ctx.storage.getAlarm(),
      meta: this.ctx.storage.sql.exec('SELECT channel,revision,generation FROM meta').toArray(),
      receipts: this.ctx.storage.sql.exec<{ n: number }>('SELECT count(*) AS n FROM receipt').one().n,
      sockets: this.ctx.getWebSockets().map((ws) => ({
        readyState: ws.readyState,
        attachment: ws.deserializeAttachment(),
      })),
    };
  }

  protected override async schedule(game?: Game | null, generation?: number, receiptAt?: number | null) {
    await super.schedule(game, generation, receiptAt);
    if (this.failNextSchedule) {
      this.failNextSchedule = false;
      throw new Error('Injected local alarm failure.');
    }
  }
}
