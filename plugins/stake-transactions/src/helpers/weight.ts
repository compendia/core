import { Interfaces, Managers, Utils } from "@nosplatform/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";

class VoteWeight {
    public static stakeObject(t: Interfaces.ITransactionData): any {
        if (t.type === 100) {
            const configManager = Managers.configManager;
            const milestone = configManager.getMilestone();

            // Get transaction data and build stake object.
            const s = t.asset.stakeCreate;

            const multiplier: number = milestone.stakeLevels[s.duration];
            const amount = Utils.BigNumber.make(s.amount);
            const sWeight: Utils.BigNumber = amount.times(multiplier);
            const redeemableTimestamp = s.timestamp + s.duration;
            const timestamp = s.timestamp;

            const o: StakeInterfaces.IStakeObject = {
                timestamp,
                amount,
                duration: s.duration,
                weight: sWeight,
                redeemableTimestamp,
                redeemed: false,
                halved: false,
            };

            return o;
        } else {
            return undefined;
        }
    }
}

export { VoteWeight };
