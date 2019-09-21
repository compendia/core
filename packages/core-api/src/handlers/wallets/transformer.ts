import { formatTimestamp } from "@arkecosystem/core-utils";
import { Utils } from "@nosplatform/crypto";

export const transformWallet = model => {
    const unixStakes = {};
    for (const key of Object.keys(model.stake)) {
        const timestamp = formatTimestamp(Number(key)).unix;
        const stake = model.stake[key];
        const epochTime = model.stake[key].redeemableTimestamp;
        unixStakes[key] = {
            timestamp,
            amount: stake.amount,
            duration: stake.duration,
            weight: stake.weight,
            redeemableTimestamp: formatTimestamp(epochTime).unix,
            redeemed: stake.redeemed,
            halved: stake.halved,
        };
    }

    return {
        address: model.address,
        publicKey: model.publicKey,
        username: model.username,
        secondPublicKey: model.secondPublicKey,
        balance: Utils.BigNumber.make(model.balance).toFixed(),
        isDelegate: !!model.username,
        stakeWeight: model.stakeWeight,
        stake: unixStakes,
        vote: model.vote,
    };
};
