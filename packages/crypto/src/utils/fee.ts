import { Managers, Utils } from "../";

export interface IFeeObject {
    toReward: Utils.BigNumber;
    toRemove: Utils.BigNumber;
}

class FeeHelper {
    public static getFeeObject(totalFee: Utils.BigNumber): IFeeObject {
        const blockReward = Managers.configManager.getMilestone().reward;
        let rewardedFees = Utils.BigNumber.ZERO;
        let removedFees = totalFee;
        let equalizer = Utils.BigNumber.ZERO;
        if (totalFee.isGreaterThan(blockReward)) {
            // If fee is odd number or one nostoshi, set equalizer to deduct remaining .5 nostoshi from removal and add to reward
            const deductedFee = totalFee.minus(blockReward);
            if (deductedFee.toNumber() % 2 || deductedFee.isEqualTo(Utils.BigNumber.ONE)) {
                equalizer = Utils.BigNumber.make(0.5);
            }
            rewardedFees = totalFee
                .minus(blockReward)
                .times(0.5) // Relative fee reward and removal factors are hard-coded since it only when split 50/50 (due to odd/even number equalizing)
                .plus(equalizer);
            removedFees = blockReward.plus(
                totalFee
                    .minus(blockReward)
                    .times(0.5)
                    .minus(equalizer),
            );
        }
        return { toReward: rewardedFees, toRemove: removedFees };
    }
}

export { FeeHelper };
