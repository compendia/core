import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { Interfaces as StakeInterfaces } from "@nosplatform/stake-transactions-crypto";
import { createHandyClient } from "handy-redis";

const redis = createHandyClient();

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

            this.emitter.emit("stake.released", { address: wallet.address, stakeKey, block, prevStakePower });
        }

        // If the stake is somehow still unreleased, don't remove it from db
        if (!(block.timestamp <= stake.timestamps.redeemable)) {
            this.removeExpiry(stakeKey);
        }
    }

    public static async storeExpiry(
        stake: StakeInterfaces.IStakeObject,
        wallet: State.IWallet,
        stakeKey: string,
        blockHeight?: number,
        skipPowerUp?: boolean,
    ): Promise<void> {
        // Function to infinitely retry storing score value to redis
        const zAdd = async (db, key, val) => {
            // Store it
            await redis.zadd(db, [key, val]);
            // Check if it exists, else retry
            while (!(await redis.zscore(db, key))) {
                await redis.zadd(db, [key, val]);
            }
        };

        const storeStake = async (stake, wallet, stakeKey) => {
            const key = `stake:${stakeKey}`;
            const store = async () => {
                await redis.hset(
                    key,
                    ["address", wallet.address],
                    ["powerUpTimestamp", stake.timestamps.powerUp.toString()],
                    ["redeemableTimestamp", stake.timestamps.redeemable.toString()],
                    ["stakeKey", stakeKey],
                );
                let exists = await redis.exists(`stake:${stakeKey}`);
                let data = await redis.hgetall(`stake:${stakeKey}`);
                while (
                    !exists ||
                    !data ||
                    data.address !== wallet.address ||
                    data.powerUpTimestamp !== stake.timestamps.powerUp.toString() ||
                    data.redeemableTimestamp !== stake.timestamps.redeemable.toString() ||
                    data.stakeKey !== stakeKey
                ) {
                    await redis.hset(
                        key,
                        ["address", wallet.address],
                        ["powerUpTimestamp", stake.timestamps.powerUp.toString()],
                        ["redeemableTimestamp", stake.timestamps.redeemable.toString()],
                        ["stakeKey", stakeKey],
                    );
                    exists = await redis.exists(`stake:${stakeKey}`);
                    data = await redis.hgetall(`stake:${stakeKey}`);
                }
            };

            await store();

            await zAdd("stake_expirations", stake.timestamps.redeemable, key);
            if (Managers.configManager.getMilestone(blockHeight).powerUp && !skipPowerUp) {
                await zAdd("stake_powerups", stake.timestamps.powerUp, key);
            }

            return true;
        };
        await storeStake(stake, wallet, stakeKey);
    }

    public static async removeExpiry(stakeKey: string): Promise<void> {
        const key = `stake:${stakeKey}`;
        await redis.del(key);
        await redis.zrem("stake_expirations", `stake:${stakeKey}`);
        await redis.zrem("stake_powerups", `stake:${stakeKey}`);
    }

    public static async processExpirations(block: Interfaces.IBlockData): Promise<void> {
        const lastTime = block.timestamp;
        const keys = await redis.zrangebyscore("stake_expirations", 0, lastTime);
        const expirations = [];
        let expirationsCount = 0;
        for (const key of keys) {
            const obj = await redis.hgetall(key);
            expirations.push(obj);
            expirationsCount++;
        }
        if (expirations && expirationsCount > 0 && expirations.length) {
            app.resolvePlugin("logger").info("Processing stake expirations.");

            const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");

            for (const expiration of expirations) {
                if (expiration && expiration.address) {
                    const wallet = databaseService.walletManager.findByAddress(expiration.address);
                    if (
                        wallet.hasAttribute("stakes") &&
                        wallet.getAttribute("stakes")[expiration.stakeKey] !== undefined &&
                        wallet.getAttribute("stakes")[expiration.stakeKey].status === "active"
                    ) {
                        await this.expireStake(wallet, expiration.stakeKey, block);

                        // If stake doesn't exist or is already redeemed or canceled
                    } else if (
                        !wallet.hasAttribute("stakes") ||
                        !wallet.getAttribute("stakes")[expiration.stakeKey] ||
                        ["redeemed", "canceled"].includes(wallet.getAttribute("stakes")[expiration.stakeKey].status)
                    ) {
                        // If stake isn't found then the chain state has reverted to a point before its stakeCreate, or the stake was already halved.
                        // Delete expiration from db in this case
                        app.resolvePlugin("logger").info(
                            `Unknown or already processed ${expiration.stakeKey} of wallet ${wallet.address}. Deleted from storage.`,
                        );
                        await this.removeExpiry(expiration.stakeKey);
                    }
                }
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}
