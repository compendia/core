import { app } from "@arkecosystem/core-container";
import { EventEmitter, State } from "@arkecosystem/core-interfaces";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { Stake } from "@nosplatform/storage";
import { LessThan } from "typeorm";

export interface IExpirationObject {
    publicKey: string;
    stakeKey: number;
    redeemableTimestamp: number;
}

export class ExpireHelper {
    public static expireStake(wallet: State.IWallet, stakeKey: number, walletManager: State.IWalletManager): void {
        const stake: StakeInterfaces.IStakeObject = wallet.stake[stakeKey];
        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        if (stake && lastBlock.data.timestamp > stake.redeemableTimestamp && !stake.redeemed && !stake.halved) {
            app.resolvePlugin("logger").info(`Stake released: ${stakeKey} of wallet ${wallet.address}.`);

            let delegate: State.IWallet;
            if (wallet.vote) {
                delegate = walletManager.findByPublicKey(wallet.vote);
            }
            // First deduct previous stakeWeight from from delegate voteBalance
            if (delegate) {
                delegate.voteBalance = delegate.voteBalance.minus(wallet.stakeWeight);
            }
            // Deduct old stake object weight from voter stakeWeight
            wallet.stakeWeight = wallet.stakeWeight.minus(stake.weight);
            // Set new stake object weight
            stake.weight = Utils.BigNumber.make(stake.weight.dividedBy(2).toFixed(0, 1));
            // Update voter total stakeWeight
            wallet.stakeWeight = wallet.stakeWeight.plus(stake.weight);
            stake.halved = true;
            // Update delegate voteBalance
            if (delegate) {
                delegate.voteBalance = delegate.voteBalance.plus(wallet.stakeWeight);
            }
            this.removeExpiry(stake, wallet, stakeKey);
            this.emitter.emit("stake.released", { publicKey: wallet.publicKey, stakeKey });
        }
    }

    public static async storeExpiry(
        stake: StakeInterfaces.IStakeObject,
        wallet: State.IWallet,
        stakeKey: number,
    ): Promise<void> {
        const stakeModel = new Stake();
        stakeModel.stakeKey = stakeKey;
        stakeModel.address = wallet.address;
        stakeModel.redeemableTimestamp = stake.redeemableTimestamp;
        await stakeModel.save();
    }

    public static async removeExpiry(
        stake: StakeInterfaces.IStakeObject,
        wallet: State.IWallet,
        stakeKey: number,
    ): Promise<void> {
        const redeemableTimestamp = stake.redeemableTimestamp;
        const stakeModel = await Stake.findOne({ address: wallet.address, redeemableTimestamp, stakeKey });
        if (stakeModel) {
            await stakeModel.remove();
        }
    }

    public static async processExpirations(walletManager: State.IWalletManager): Promise<void> {
        app.resolvePlugin("logger").info("Processing stake expirations.");
        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const lastTime = lastBlock.data.timestamp;
        const expirations = await Stake.find({ where: { redeemableTimestamp: LessThan(lastTime) } });
        for (const expiration of expirations) {
            const wallet = walletManager.findByAddress(expiration.address);
            if (wallet.stake[expiration.stakeKey] && wallet.stake[expiration.stakeKey].halved === false) {
                this.expireStake(wallet, expiration.stakeKey, walletManager);
            } else if (wallet.stake[expiration.stakeKey] === undefined) {
                // If stake isn't found then the chain state has reverted to a point before its stakeCreate.
                // Delete expiration from db in this case
                await expiration.remove();
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}
