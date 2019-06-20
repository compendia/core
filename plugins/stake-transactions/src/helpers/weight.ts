import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";

class VoteWeight {
    public static stakeObject(t: Interfaces.ITransactionData): any {
        if (t.type === 100) {
            const configManager = Managers.configManager;
            const milestone = configManager.getMilestone();

            // Get transaction data and build stake object.
            const s = t.asset.stakeCreate;

            // Check that this is not a renewal cancelation
            let level: StakeInterfaces.StakeLevel;

            if (s.duration >= 7889400 && s.duration < 15778800) {
                level = "3m";
            } else if (s.duration >= 15778800 && s.duration < 31557600) {
                level = "6m";
            } else if (s.duration >= 31557600 && s.duration < 63115200) {
                level = "1y";
            } else if (s.duration > 63115200) {
                level = "2y";
            }

            const multiplier: number = milestone.stakeLevels[level];
            const sWeight: Utils.BigNumber = s.amount.times(multiplier);

            const o: StakeInterfaces.IStakeObject = {
                amount: s.amount,
                duration: s.duration,
                weight: sWeight,
                redeemableTimestamp: s.redeemableTimestamp,
                redeemed: false,
            };

            return o;
        } else {
            return undefined;
        }
    }
}

export { VoteWeight };
