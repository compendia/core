import { State } from "@arkecosystem/core-interfaces";
import { Managers, Utils } from "@arkecosystem/crypto";
import { Interfaces } from "@nosplatform/stake-transactions-crypto";

class VotePower {
    public static stakeObject(s: Interfaces.IStakeCreateAsset, id: string, blockHeight?: number): any {
        const configManager = Managers.configManager;
        const milestone = configManager.getMilestone(blockHeight || null);
        const multiplier: number = milestone.stakeLevels[s.duration];
        const amount = Utils.BigNumber.make(s.amount);
        const sPower: Utils.BigNumber = amount.times(multiplier).dividedBy(10);
        const created = s.timestamp;
        const graceEnd = Number(created) + Number(milestone.graceEnd || 0);
        const powerUp = Number(graceEnd) + Number(milestone.powerUp || 0);
        const redeemable = powerUp + s.duration;
        const timestamps: Interfaces.IStakeTimestamps = { created, graceEnd, powerUp, redeemable };
        const o: Interfaces.IStakeObject = {
            id,
            timestamps,
            duration: s.duration,
            amount,
            power: sPower,
            active: false,
            redeemed: false,
            halved: false,
            canceled: false,
        };

        return o;
    }

    public static getGraced(sender: State.IWallet): Utils.BigNumber {
        const senderStakes = sender.hasAttribute("stakes") ? sender.getAttribute("stakes", {}) : {};
        const gracedStakes = Object.values(senderStakes).filter((stake: Interfaces.IStakeObject) => {
            return !stake.canceled && !stake.active && !stake.halved && !stake.redeemed;
        });
        let senderGraced: Utils.BigNumber = Utils.BigNumber.ZERO;
        for (const { amount } of gracedStakes as Interfaces.IStakeObject[]) {
            senderGraced = senderGraced.plus(amount);
        }
        return senderGraced;
    }
}

export { VotePower };
