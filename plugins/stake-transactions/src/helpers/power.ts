import { Managers, Utils } from "@arkecosystem/crypto";
import { Interfaces } from "@nosplatform/stake-transactions-crypto";

class VotePower {
    public static stakeObject(
        s: Interfaces.IStakeCreateAsset,
        id: string,
        senderPublicKey: string,
        blockHeight?: number,
    ): any {
        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone(blockHeight || undefined);
        const multiplier: number = milestone.stakeLevels[s.duration];
        const amount = Utils.BigNumber.make(s.amount);
        const sPower: Utils.BigNumber = amount.times(multiplier).dividedBy(10);
        const created = s.timestamp;
        const graceEnd = Number(created) + Number(milestone.graceEnd || 0);
        const powerUp = Number(graceEnd) + Number(milestone.powerUp || 0);
        const redeemable = powerUp + s.duration;
        const timestamps: Interfaces.IStakeTimestamps = { created, graceEnd, powerUp, redeemable };
        const status = milestone.graceEnd ? "grace" : "active";
        const o: Interfaces.IStakeObject = {
            id,
            senderPublicKey,
            timestamps,
            duration: s.duration,
            amount,
            power: sPower,
            status,
        };

        return o;
    }
}

export { VotePower };
