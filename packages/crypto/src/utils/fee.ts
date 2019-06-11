import { Interfaces, Utils } from "../";

export interface IFeeObject {
    toReward: Utils.BigNumber;
    toRemove: Utils.BigNumber;
}

class FeeHelper {
    public static getFeeObject(block: Interfaces.IBlockData): IFeeObject {
        let rewardedFees = Utils.BigNumber.ZERO;
        let removedFees = block.totalFee;
        let equalizer = Utils.BigNumber.ZERO;
        if (block.totalFee.isGreaterThan(block.reward)) {
            // If fee is odd number or one nostoshi, set equalizer to deduct remaining .5 nostoshi from removal and add to reward
            const deductedFee = block.totalFee.minus(block.reward);
            if (deductedFee.toNumber() % 2 || deductedFee.isEqualTo(Utils.BigNumber.ONE)) {
                equalizer = Utils.BigNumber.make(0.5);
            }
            rewardedFees = block.totalFee
                .minus(block.reward)
                .times(0.5) // Relative fee reward and removal factors are hard-coded since it only when split 50/50 (due to odd/even number equalizing)
                .plus(equalizer);
            removedFees = block.reward.plus(
                block.totalFee
                    .minus(block.reward)
                    .times(0.5)
                    .minus(equalizer),
            );
        }
        return { toReward: rewardedFees, toRemove: removedFees };
    }
}

export { FeeHelper };
