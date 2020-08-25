import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import { Interfaces as StakeInterfaces } from "@nosplatform/stake-transactions-crypto";
import { database, IStakeDbItem } from "../index";

export class ExpireHelper {
    public static async expireStake(
        wallet: State.IWallet,
        stakeKey: string,
        block: Interfaces.IBlockData,
    ): Promise<void> {
        const stakes: StakeInterfaces.IStakeArray = wallet.getAttribute("stakes", {});
        const stake: StakeInterfaces.IStakeObject = stakes[stakeKey];
        if (stake.status === "active" && block.timestamp > stake.timestamps.redeemable) {
            const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
            const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
                "transaction-pool",
            );
            app.resolvePlugin("logger").info(`Stake released: ${stakeKey} of wallet ${wallet.address}.`);
            let delegate: State.IWallet;
            let poolDelegate: State.IWallet;
            if (wallet.hasVoted()) {
                delegate = databaseService.walletManager.findByPublicKey(wallet.getAttribute("vote"));
                poolDelegate = poolService.walletManager.findByPublicKey(wallet.getAttribute("vote"));
            }
            // First deduct previous stakePower from from delegate voteBalance
            if (delegate) {
                delegate.setAttribute(
                    "delegate.voteBalance",
                    delegate
                        .getAttribute("delegate.voteBalance")
                        .minus(wallet.getAttribute("stakePower", Utils.BigNumber.ZERO)),
                );
                poolDelegate.setAttribute(
                    "delegate.voteBalance",
                    poolDelegate
                        .getAttribute("delegate.voteBalance")
                        .minus(wallet.getAttribute("stakePower", Utils.BigNumber.ZERO)),
                );
            }

            // Deduct old stake object power from voter stakePower
            const walletStakePower = wallet.getAttribute<Utils.BigNumber>("stakePower").minus(stake.power);
            // Set new stake object power
            const prevStakePower = stake.power;
            const newStakePower = Utils.BigNumber.make(
                Utils.BigNumber.make(stake.power)
                    .dividedBy(2)
                    .toFixed(),
            );
            // Update voter total stakePower
            const newWalletStakePower = walletStakePower.plus(newStakePower);

            stake.status = "released";
            stake.power = newStakePower;
            stakes[stakeKey] = stake;

            wallet.setAttribute("stakePower", newWalletStakePower);
            wallet.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

            const poolWallet = poolService.walletManager.findByAddress(wallet.address);
            poolWallet.setAttribute("stakePower", newWalletStakePower);
            poolWallet.setAttribute("stakes", JSON.parse(JSON.stringify(stakes)));

            // Update delegate voteBalance
            if (delegate) {
                delegate.setAttribute(
                    "delegate.voteBalance",
                    delegate.getAttribute("delegate.voteBalance").plus(wallet.getAttribute("stakePower")),
                );
                poolDelegate.setAttribute(
                    "delegate.voteBalance",
                    poolDelegate.getAttribute("delegate.voteBalance").plus(wallet.getAttribute("stakePower")),
                );
            }

            const walletManager1 = databaseService.walletManager;
            const walletManager2 = poolService.walletManager;
            walletManager1.reindex(wallet);
            walletManager2.reindex(poolWallet);

            if (delegate) {
                walletManager1.reindex(delegate);
                walletManager2.reindex(poolDelegate);
            }

            if (this.emitter !== undefined) {
                this.emitter.emit("stake.released", { address: wallet.address, stakeKey, block, prevStakePower });
            }
        }

        // If the stake is somehow still unreleased, don't remove it from db
        if (!(block.timestamp <= stake.timestamps.redeemable)) {
            this.removeExpiry(stakeKey);
        }
    }

    public static storeExpiry(
        stake: StakeInterfaces.IStakeObject,
        wallet: State.IWallet,
        stakeKey: string,
        blockHeight?: number,
        skipPowerUp?: boolean,
    ): void {
        // Write to SQLite in-mem db
        const insertStatement = database.prepare(
            `INSERT OR IGNORE INTO stakes ` +
                "(key, address, powerup, redeemable, status) VALUES " +
                "(:key, :address, :powerup, :redeemable, :status);",
        );

        insertStatement.run({
            key: stakeKey,
            address: wallet.address,
            powerup: stake.timestamps.powerUp.toString(),
            redeemable: stake.timestamps.redeemable.toString(),
            status: skipPowerUp ? 1 : 0,
        });
    }

    public static removeExpiry(stakeKey: string): void {
        // Write to SQLite in-mem db
        const deleteStatement = database.prepare(`DELETE FROM stakes WHERE key = :key`);

        deleteStatement.run({ key: stakeKey });
    }

    public static async processExpirations(block: Interfaces.IBlockData): Promise<void> {
        const lastTime = block.timestamp;
        const expirations: IStakeDbItem[] = database
            .prepare(`SELECT * FROM stakes WHERE redeemable <= ${lastTime}`)
            .all();

        if (expirations.length > 0) {
            app.resolvePlugin("logger").info("Processing stake expirations.");

            const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");

            for (const expiration of expirations) {
                if (expiration && expiration.address) {
                    const wallet = databaseService.walletManager.findByAddress(expiration.address);
                    if (
                        wallet.hasAttribute("stakes") &&
                        wallet.getAttribute("stakes")[expiration.key] !== undefined &&
                        wallet.getAttribute("stakes")[expiration.key].status === "active"
                    ) {
                        await this.expireStake(wallet, expiration.key, block);

                        // If stake doesn't exist or is already redeemed or canceled
                    } else if (
                        !wallet.hasAttribute("stakes") ||
                        !wallet.getAttribute("stakes")[expiration.key] ||
                        ["redeemed", "canceled"].includes(wallet.getAttribute("stakes")[expiration.key].status)
                    ) {
                        // If stake isn't found then the chain state has reverted to a point before its stakeCreate, or the stake was already halved.
                        // Delete expiration from db in this case
                        app.resolvePlugin("logger").info(
                            `Unknown or already processed ${expiration.key} of wallet ${wallet.address}. Deleted from storage.`,
                        );
                        this.removeExpiry(expiration.key);
                    }
                }
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}
