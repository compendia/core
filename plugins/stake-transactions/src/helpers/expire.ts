import { State } from "@arkecosystem/core-interfaces";
import { Crypto, Utils } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";

export class ExpireHelper {
    public static processStakes(sender: State.IWallet, walletManager: State.IWalletManager): any {
        for (const stakeObject of Object.values(sender.stake)) {
            const stake: StakeInterfaces.IStakeObject = stakeObject;
            let delegate: State.IWallet;
            if (sender.vote) {
                delegate = walletManager.findByPublicKey(sender.vote);
            }
            if (
                stake &&
                (Crypto.Slots.getTime() - 120 > stake.redeemableTimestamp ||
                    Crypto.Slots.getTime() + 120 > stake.redeemableTimestamp) &&
                !stake.redeemed &&
                !stake.halved
            ) {
                // First deduct previous stakeWeight from from delegate voteBalance
                if (delegate) {
                    delegate.voteBalance = delegate.voteBalance.minus(sender.stakeWeight);
                }
                // Deduct old stake object weight from voter stakeWeight
                sender.stakeWeight = sender.stakeWeight.minus(stake.weight);
                // Set new stake object weight
                stake.weight = Utils.BigNumber.make(stake.weight.dividedBy(2).toFixed(0, 1));
                // Update voter total stakeWeight
                sender.stakeWeight = sender.stakeWeight.plus(stake.weight);
                stake.halved = true;
                // Update delegate voteBalance
                if (delegate) {
                    delegate.voteBalance = delegate.voteBalance.plus(sender.stakeWeight);
                }
            }
        }
    }
}
