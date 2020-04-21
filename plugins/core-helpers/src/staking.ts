import { State } from "@arkecosystem/core-interfaces";
import { Utils } from "@arkecosystem/crypto";
import { Interfaces } from "@nosplatform/stake-transactions-crypto";

class Staking {
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

    public static getPower(sender: State.IWallet): Utils.BigNumber {
        const graced: Utils.BigNumber = this.getGraced(sender) || Utils.BigNumber.ZERO;
        const balance: Utils.BigNumber = sender.balance || Utils.BigNumber.ZERO;
        const stakePower: Utils.BigNumber = sender.getAttribute("stakePower", Utils.BigNumber.ZERO);
        const lockedBalance = sender.getAttribute("htlc.lockedBalance", Utils.BigNumber.ZERO);
        return graced
            .plus(balance)
            .plus(stakePower)
            .plus(lockedBalance);
    }
}

export { Staking };
