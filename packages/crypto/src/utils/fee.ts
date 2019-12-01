import { Utils } from "../";

export interface IFeeObject {
    toReward: Utils.BigNumber;
    toRemove: Utils.BigNumber;
}

class FeeHelper {
    public static getFeeObject(totalFee: Utils.BigNumber, totalReward: Utils.BigNumber): IFeeObject {
        totalFee = totalFee ? totalFee : Utils.BigNumber.ZERO;
        // Calculate collective reward (block reward + top rewards)
        let rewardedFees = Utils.BigNumber.ZERO;
        let removedFees = totalFee;
        let equalizer = Utils.BigNumber.ZERO;
        if (
            Utils.BigNumber.make(totalFee).isGreaterThan(totalReward) &&
            totalReward.isGreaterThan(Utils.BigNumber.ZERO)
        ) {
            // If fee is odd number or one nostoshi, set equalizer to deduct remaining .5 nostoshi from removal and add to reward
            const deductedFee = totalFee.minus(totalReward);
            if (Number(deductedFee) % 2 || deductedFee.isEqualTo(Utils.BigNumber.ONE)) {
                equalizer = Utils.BigNumber.make(0.5);
            }
            rewardedFees = deductedFee
                .dividedBy(2) // Relative fee reward and removal factors are hard-coded since it's only when split 50/50 (due to odd/even number equalizing)
                .plus(equalizer);
            removedFees = deductedFee
                .dividedBy(2)
                .plus(totalReward)
                .minus(equalizer);
        } else if (totalReward.isGreaterThan(Utils.BigNumber.ZERO)) {
            // If there are block rewards but the collected fees are equal to or lower than the block reward: all fees are removed.
            removedFees = totalFee;
            rewardedFees = Utils.BigNumber.ZERO;
        } else {
            // If there is no block reward: all fees should be awarded to the forger.
            removedFees = Utils.BigNumber.ZERO;
            rewardedFees = totalFee;
        }

        return { toReward: rewardedFees, toRemove: removedFees };
    }
}

export { FeeHelper };
