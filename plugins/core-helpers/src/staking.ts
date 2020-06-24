import { State } from "@arkecosystem/core-interfaces";
import { Utils } from "@arkecosystem/crypto";
import { Interfaces } from "@nosplatform/stake-transactions-crypto";

class Staking {
    // Gets the stakes that are currently in grace period (for API to return vote power from stakes in grace)
    public static getGraced(sender: State.IWallet): Utils.BigNumber {
        const senderStakes = sender.hasAttribute("stakes") ? sender.getAttribute("stakes", {}) : {};
        const gracedStakes = Object.values(senderStakes).filter((stake: Interfaces.IStakeObject) => {
            return stake.status === "grace";
        });
        let senderGraced: Utils.BigNumber = Utils.BigNumber.ZERO;
        for (const { amount } of gracedStakes as Interfaces.IStakeObject[]) {
            senderGraced = senderGraced.plus(amount);
        }
        return senderGraced;
    }

    public static getPower(sender: State.IWallet): Utils.BigNumber {
        const graced: Utils.BigNumber = this.getGraced(sender);
        const balance: Utils.BigNumber = sender.balance;
        const stakePower: Utils.BigNumber = sender.getAttribute("stakePower", Utils.BigNumber.ZERO);
        const lockedBalance = sender.getAttribute("htlc.lockedBalance", Utils.BigNumber.ZERO);
        return graced
            .plus(balance)
            .plus(stakePower)
            .plus(lockedBalance);
    }
}

export { Staking };
