import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { Interfaces, Managers, Utils } from "..";

import { IStakeObject } from "stake-registration-transaction/dist/interfaces";

class VoteWeight {
    public static stakeObject(t: Interfaces.ITransactionData): IStakeObject {
        if (t.type === 100) {
            const configManager = Managers.configManager;
            const lastBlock = app
                .resolvePlugin<State.IStateService>("state")
                .getStore()
                .getLastBlock();
            const milestone = configManager.getMilestone(lastBlock.data.height);

            // Get transaction data and build stake object.
            const s = t.asset.stakeRegistration;

            // Check that this is not a renewal cancelation
            let level: string;

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
            const sWeight: Utils.BigNumber = t.amount.times(multiplier);

            const o: IStakeObject = {
                start: t.timestamp,
                amount: t.amount,
                duration: s.duration,
                weight: sWeight,
                renewing: s.renewing,
            };

            return o;
        } else {
            return undefined;
        }
    }
}

export { VoteWeight };
