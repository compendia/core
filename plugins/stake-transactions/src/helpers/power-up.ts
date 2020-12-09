import { app } from "@arkecosystem/core-container";

import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import { Interfaces as StakeInterfaces } from "@nosplatform/stake-transactions-crypto";
import { database, IStakeDbItem } from "../index";

export class PowerUpHelper {
    public static powerUp(address: string, stakeKey: string, walletManager: State.IWalletManager): void {
        const wallet: State.IWallet = walletManager.findByAddress(address);
        const stakes: StakeInterfaces.IStakeArray = wallet.getAttribute("stakes", {});
        const stake: StakeInterfaces.IStakeObject = stakes[stakeKey];
        const stakePower: Utils.BigNumber = wallet.getAttribute("stakePower", Utils.BigNumber.ZERO);
        stakes[stakeKey].status = "active";
        wallet.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));
        wallet.setAttribute("stakePower", stakePower.plus(stake.power));
        if (wallet.hasVoted()) {
            const delegate: State.IWallet = walletManager.findByPublicKey(wallet.getAttribute("vote"));
            const voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);
            const newVoteBalance: Utils.BigNumber = voteBalance.minus(stake.amount).plus(stake.power);
            delegate.setAttribute("delegate.voteBalance", newVoteBalance);
            walletManager.reindex(delegate);
        }

        walletManager.reindex(wallet);
        this.removePowerUp(stakeKey);
    }

    public static removePowerUp(stakeKey: string): void {
        const updateStatement = database.prepare(`UPDATE stakes SET status = 1 WHERE key = :key`);

        updateStatement.run({ key: stakeKey });
    }

    public static async processPowerUps(
        currentBlock: Interfaces.IBlockData,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        let block: Interfaces.IBlockData;
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        if (roundCalculator.isNewRound(currentBlock.height)) {
            block = currentBlock;
        } else {
            const roundHeight: number = roundCalculator.calculateRound(currentBlock.height).roundHeight;
            block = await databaseService.blocksBusinessRepository.findByHeight(roundHeight);
        }
        const lastTime = block.timestamp;
        const stakes: IStakeDbItem[] = database
            .prepare(`SELECT * FROM stakes WHERE powerup <= ${lastTime} AND status = 0`)
            .all();
        if (stakes.length > 0) {
            app.resolvePlugin("logger").debug("Processing stake power-ups.");

            for (const stake of stakes) {
                if (stake && stake.address) {
                    const wallet = walletManager.findByAddress(stake.address);
                    if (
                        wallet.hasAttribute("stakes") &&
                        wallet.getAttribute("stakes")[stake.key] !== undefined &&
                        wallet.getAttribute("stakes")[stake.key].status === "grace"
                    ) {
                        app.resolvePlugin("logger").debug(`Power-up Stake ${stake.key} of wallet ${wallet.address}.`);

                        // Power up in db wallet
                        this.powerUp(wallet.address, stake.key, walletManager);

                        // Power up in pool wallet
                        const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
                            "transaction-pool",
                        );
                        this.powerUp(wallet.address, stake.key, poolService.walletManager);

                        const stakeObj = wallet.getAttribute("stakes")[stake.key];
                        if (this.emitter !== undefined) {
                            this.emitter.emit("stake.powerup", { stake: stakeObj, block });
                        }
                    } else {
                        // If stake isn't found then the chain state has reverted to a point before its stakeCreate, or the stake was already halved.
                        // Delete stake from db in this case
                        this.removePowerUp(stake.key);
                    }
                }
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}
