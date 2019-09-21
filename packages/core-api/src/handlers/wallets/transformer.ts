import { formatTimestamp } from "@arkecosystem/core-utils";
import { Utils } from "@nosplatform/crypto";

export const transformWallet = model => {
    for (const key of Object.keys(model.stake)) {
        const newKey = formatTimestamp(Number(key)).unix.toString();
        model.stake[newKey] = model.stake[key];
        model.stake[newKey].redeemableTimestamp = formatTimestamp(model.stake[key].redeemableTimestamp).unix;
        delete model.stake[key];
    }

    return {
        address: model.address,
        publicKey: model.publicKey,
        username: model.username,
        secondPublicKey: model.secondPublicKey,
        balance: Utils.BigNumber.make(model.balance).toFixed(),
        isDelegate: !!model.username,
        stakeWeight: model.stakeWeight,
        stake: model.stake,
        vote: model.vote,
    };
};
