import { app } from "@arkecosystem/core-container";

import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import { Interfaces as StakeInterfaces } from "@nosplatform/stake-transactions-crypto";
import { database, IStakeDbItem } from "../index";

export class RedeemHelper {
    public static redeem(wallet: State.IWallet, stakeKey: string, walletManager: State.IWalletManager): void {
        const stakes: StakeInterfaces.IStakeArray = wallet.getAttribute("stakes", {});
        const stake: StakeInterfaces.IStakeObject = stakes[stakeKey];
        const stakePower: Utils.BigNumber = wallet.getAttribute("stakePower", Utils.BigNumber.ZERO);

        // Set status
        stakes[stakeKey].status = "redeemed";

        // Save stake
        wallet.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));
        // Remove from wallet stakePower
        wallet.setAttribute("stakePower", stakePower.minus(stake.power));
        // Add to balance
        wallet.balance = wallet.balance.plus(stake.amount);

        if (wallet.hasVoted()) {
            const delegate: State.IWallet = walletManager.findByPublicKey(wallet.getAttribute("vote"));
            // Update delegate voteBalance
            const voteBalance: Utils.BigNumber = delegate.getAttribute("delegate.voteBalance", Utils.BigNumber.ZERO);
            const newVoteBalance: Utils.BigNumber = voteBalance.plus(stake.amount).minus(stake.power);
            delegate.setAttribute("delegate.voteBalance", newVoteBalance);
            walletManager.reindex(delegate);
        }

        walletManager.reindex(wallet);
    }

    public static removeRedeem(stakeKey: string): void {
        const deleteStatement = database.prepare(`DELETE FROM stakes WHERE key = :key`);
        deleteStatement.run({ key: stakeKey });
    }

    public static setRedeeming(stakeKey: string, redeemAt: number): void {
        const updateStatement = database.prepare(`UPDATE stakes SET status = 3, redeem_at = :time WHERE key = :key`);
        updateStatement.run({ key: stakeKey, time: Number(redeemAt.toFixed(0)) });
    }

    public static revertRedeeming(stakeKey: string): void {
        const updateStatement = database.prepare(`UPDATE stakes SET status = 2, redeem_at = NULL WHERE key = :key`);
        updateStatement.run({ key: stakeKey });
    }

    public static async processRedeems(
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
            .prepare(`SELECT * FROM stakes WHERE status = 3 AND redeem_at <= ${lastTime}`)
            .all();

        if (stakes.length > 0) {
            app.resolvePlugin("logger").debug("Processing stake redeems.");

            for (const stake of stakes) {
                if (stake && stake.address) {
                    const wallet = walletManager.findByAddress(stake.address);
                    if (
                        wallet.hasAttribute("stakes") &&
                        wallet.getAttribute("stakes")[stake.key] !== undefined &&
                        wallet.getAttribute("stakes")[stake.key].status === "redeeming"
                    ) {
                        app.resolvePlugin("logger").debug(`Redeem Stake ${stake.key} of wallet ${wallet.address}.`);

                        // Power up in db wallet
                        this.redeem(wallet, stake.key, walletManager);

                        // Power up in pool wallet
                        const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
                            "transaction-pool",
                        );
                        const poolWalletManager: State.IWalletManager = poolService.walletManager;
                        this.redeem(
                            poolWalletManager.findByAddress(wallet.address),
                            stake.key,
                            poolService.walletManager,
                        );

                        const stakeObj = wallet.getAttribute("stakes")[stake.key];
                        if (this.emitter !== undefined) {
                            this.emitter.emit("stake.redeem", { stake: stakeObj, block });
                        }

                        // Remove queued power-up from in mem db
                        this.removeRedeem(stake.key);
                    } else {
                        // If stake isn't found then the chain state has reverted to a point before its stakeCreate,
                        // or the stake was already redeemed.
                        // Delete stake from db in this case
                        this.removeRedeem(stake.key);
                    }
                }
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}
