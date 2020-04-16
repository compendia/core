import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { formatTimestamp } from "@arkecosystem/core-utils";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import { StakeHelpers } from "@nosplatform/stake-transactions";

export const transformWallet = (wallet: State.IWallet) => {
    const username: string = wallet.getAttribute("delegate.username");
    const multiSignature: Interfaces.IMultiSignatureAsset = wallet.getAttribute("multiSignature");
    const secondPublicKey = wallet.getAttribute("secondPublicKey");

    let attributes = {};

    if (wallet.hasAttribute("delegate")) {
        const delegate = JSON.parse(JSON.stringify(wallet.getAttribute("delegate")));
        if (delegate.lastBlock && delegate.lastBlock.timestamp) {
            delegate.lastBlock.timestamp = formatTimestamp(delegate.lastBlock.timestamp).unix;
        }
        attributes = { delegate };
    }

    // TODO: cleanup V3
    let business: any;
    if (app.has("core-magistrate-transactions")) {
        business = wallet.getAttribute("business");

        if (business) {
            business = {
                ...business.businessAsset,
                publicKey: wallet.publicKey,
                resigned: business.resigned,
            };
        }
    }

    const unixStakes = {};
    let gracedBalance = Utils.BigNumber.ZERO;
    if (app.has("stake-transactions")) {
        for (const key of Object.keys(wallet.getAttribute("stakes", {}))) {
            const stake = wallet.getAttribute("stakes", {})[key];
            const epochTime = wallet.getAttribute("stakes", {})[key].redeemableTimestamp;
            unixStakes[key] = {
                timestamp: formatTimestamp(stake.timestamp).unix,
                amount: stake.amount,
                duration: stake.duration,
                power: stake.power,
                redeemableTimestamp: formatTimestamp(epochTime).unix,
                redeemed: stake.redeemed,
                halved: stake.halved,
            };
        }

        // Get graced balance
        gracedBalance = StakeHelpers.VotePower.getGraced(wallet);
    }

    const lockedBalance = wallet.hasAttribute("htlc.lockedBalance")
        ? wallet.getAttribute("htlc.lockedBalance").toFixed()
        : undefined;

    return {
        address: wallet.address,
        publicKey: wallet.publicKey,
        nonce: wallet.nonce.toFixed(),
        balance: Utils.BigNumber.make(wallet.balance).toFixed(),
        // TODO: remove with v3
        lockedBalance,
        gracedBalance,
        isDelegate: !!username,
        isResigned: !!wallet.getAttribute("delegate.resigned"),
        vote: wallet.getAttribute("vote"),
        multiSignature,
        stakePower: wallet.getAttribute("stakePower", "0"),
        power: Utils.BigNumber.make(wallet.getAttribute("stakePower", "0"))
            .plus(gracedBalance)
            .plus(Utils.BigNumber.make(wallet.balance))
            .plus(lockedBalance || 0)
            .toFixed(),
        stakes: unixStakes,
        attributes,
        ...(username && { username }), // only adds username if it is defined
        ...(secondPublicKey && { secondPublicKey }), // same with secondPublicKey
    };
};
