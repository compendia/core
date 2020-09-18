import { app } from "@arkecosystem/core-container";
import { Database, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Interfaces as StakeInterfaces } from "@nosplatform/stake-transactions-crypto";
import { database, IStakeDbItem } from "../index";
import { PowerUpHelper } from "./power-up";

export class QueueHelper {

  public static add(
    stake: StakeInterfaces.IStakeObject,
    wallet: State.IWallet,
    stakeKey: string,
  ): void {
    // Write to SQLite in-mem db
    const insertStatement = database.prepare(
      `INSERT OR IGNORE INTO stake_queue ` +
      "(key, address, powerup, redeemable) VALUES " +
      "(:key, :address, :powerup, :redeemable);",
    );

    insertStatement.run({
      key: stakeKey,
      address: wallet.address,
      powerup: stake.timestamps.powerUp.toString(),
      redeemable: stake.timestamps.redeemable.toString(),
    });
  }

  public static clearQueue(): void {
    // Write to SQLite in-mem db
    database.prepare(`DELETE FROM stake_queue`).run();
    database.prepare(`VACUUM`).run();
    app.resolvePlugin("logger").info("Clear stake queue.");
  }

  public static processQueue(): void {
    const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
    const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
      "transaction-pool",
    );

    const stakes: IStakeDbItem[] = database
      .prepare(`SELECT * FROM stake_queue`)
      .all();

    console.error('STAKES');
    console.error(stakes);

    if (stakes.length > 0) {
      app.resolvePlugin("logger").info("Processing stake queue.");
      for (const stake of stakes) {
        if (stake && stake.address) {
          // Update in database
          const dbWallet = databaseService.walletManager.findByAddress(stake.address);
          PowerUpHelper.powerUp(dbWallet, stake.key, databaseService.walletManager);
          // Update in state
          const poolWallet = poolService.walletManager.findByAddress(stake.address);
          PowerUpHelper.powerUp(poolWallet, stake.key, poolService.walletManager);
        }
      }
      this.clearQueue();
    }
  }
}
