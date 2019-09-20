import { Utils } from "@nosplatform/crypto";

export const transformWallet = model => {
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
