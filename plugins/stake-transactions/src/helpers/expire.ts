import { app } from "@arkecosystem/core-container";
import { EventEmitter, State } from "@arkecosystem/core-interfaces";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { asValue } from "awilix";

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
            app.resolvePlugin("logger").info(`Stake expired: ${stakeKey} of wallet ${wallet.address}.`);

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
            this.emitter.emit("stake.expired", { publicKey: wallet.publicKey, stakeKey });
        }
    }

    public static storeExpiry(stake: StakeInterfaces.IStakeObject, wallet: State.IWallet, stakeKey: number): void {
        const expirationMonth = this.getMonth(stake.redeemableTimestamp);
        const expirationKey = `stake.expirations.${expirationMonth}`;
        let expirationList: IExpirationObject[] = [];

        if (app.has(expirationKey)) {
            expirationList = app.resolve(expirationKey);
        }

        const expirationObject: IExpirationObject = {
            publicKey: wallet.publicKey,
            stakeKey,
            redeemableTimestamp: stake.redeemableTimestamp,
        };

        expirationList.push(expirationObject);

        app.register(expirationKey, asValue(expirationList));
    }

    public static removeExpiry(stake: StakeInterfaces.IStakeObject, wallet: State.IWallet, stakeKey: number): void {
        const expirationMonth = this.getMonth(stake.redeemableTimestamp);
        const expirationKey = `stake.expirations.${expirationMonth}`;
        const expirationList: IExpirationObject[] = app.resolve(expirationKey);
        const redeemableTimestamp = stake.redeemableTimestamp;
        const expirationObject: IExpirationObject = { publicKey: wallet.publicKey, stakeKey, redeemableTimestamp };

        const index = expirationList.indexOf(expirationObject);
        expirationList.splice(index, 1);

        app.register(expirationKey, asValue(expirationList));
    }

    public static processMonthExpirations(walletManager: State.IWalletManager): void {
        app.resolvePlugin("logger").info("Processing stake expirations.");
        const lastBlock: Interfaces.IBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const lastTime = lastBlock.data.timestamp;
        const expirationMonth = this.getMonth(lastTime);
        const expirationKey = `stake.expirations.${expirationMonth}`;
        if (app.has(expirationKey)) {
            const expirations: IExpirationObject[] = app.resolve(expirationKey);
            for (const expiration of expirations) {
                const wallet = walletManager.findByPublicKey(expiration.publicKey);
                if (lastBlock.data.timestamp > expiration.redeemableTimestamp && wallet.stake[expiration.stakeKey]) {
                    this.expireStake(wallet, expiration.stakeKey, walletManager);
                } else if (wallet.stake[expiration.stakeKey] === undefined) {
                    // If stake isn't found then the chain state has reverted to a point before its stakeCreate.
                    // Delete expiration from list in this case
                    const index = expirations.indexOf(expiration);
                    expirations.splice(index, 1);
                    app.register(expirationKey, asValue(expirations));
                }
            }
        }
    }

    public static getMonth(time: number): number {
        const e = new Date(time * 1000);
        const month = new Date(e.getFullYear(), e.getMonth(), 1).getTime() / 1000;
        return month;
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}
