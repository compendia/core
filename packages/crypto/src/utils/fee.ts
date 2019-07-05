import { Managers, Utils } from "../";

export interface IFeeObject {
    toReward: Utils.BigNumber;
    toRemove: Utils.BigNumber;
}

class FeeHelper {
    public static getFeeObject(totalFee: Utils.BigNumber): IFeeObject {
        // Calculate collective reward (4 NOS)
        const totalReward = Utils.BigNumber.make(Managers.configManager.getMilestone().reward).plus(
            Managers.configManager.getMilestone().topReward,
        );
        let rewardedFees = Utils.BigNumber.ZERO;
        let removedFees = totalFee;
        let equalizer = Utils.BigNumber.ZERO;
        if (Utils.BigNumber.make(totalFee).isGreaterThan(totalReward)) {
            // If fee is odd number or one nostoshi, set equalizer to deduct remaining .5 nostoshi from removal and add to reward
            const deductedFee = totalFee.minus(totalReward);
            if (deductedFee.toNumber() % 2 || deductedFee.isEqualTo(Utils.BigNumber.ONE)) {
                equalizer = Utils.BigNumber.make(0.5);
            }
            rewardedFees = Utils.BigNumber.make(totalFee)
                .minus(totalReward)
                .times(0.5) // Relative fee reward and removal factors are hard-coded since it only when split 50/50 (due to odd/even number equalizing)
                .plus(equalizer);
            removedFees = Utils.BigNumber.make(totalReward).plus(
                totalFee
                    .minus(totalReward)
                    .times(0.5)
                    .minus(equalizer),
            );
        }
        return { toReward: rewardedFees, toRemove: removedFees };
    }
}

export { FeeHelper };
