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
}

export { Staking };
