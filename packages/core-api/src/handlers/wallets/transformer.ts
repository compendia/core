import { app } from "@arkecosystem/core-container";
import { State } from "@arkecosystem/core-interfaces";
import { formatTimestamp } from "@arkecosystem/core-utils";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import { Staking } from "@nosplatform/core-helpers";
import dayjs from "dayjs";

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

    let files = {};
    if (wallet.hasAttribute("files")) {
        files = wallet.getAttribute("files");
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
            const time = dayjs().valueOf() / 1000;
            let status = stake.status;
            if (status === "grace" && time > Number(formatTimestamp(stake.timestamps.graceEnd).unix)) {
                status = "powering";
            }
            unixStakes[key] = {
                status,
                amount: stake.amount,
                duration: stake.duration,
                power: stake.power,
                timestamps: {
                    created: formatTimestamp(stake.timestamps.created).unix,
                    graceEnd: formatTimestamp(stake.timestamps.graceEnd).unix,
                    powerUp: formatTimestamp(stake.timestamps.powerUp).unix,
                    redeemable: formatTimestamp(stake.timestamps.redeemable).unix,
                },
                senderPublicKey: stake.senderPublicKey,
            };

            // If stake is redeeming, include redeemAt timestamp
            if (stake.timestamps.redeemAt) {
                unixStakes[key].timestamps.redeemAt = formatTimestamp(stake.timestamps.redeemAt).unix;
            }
        }

        // Get graced balance
        gracedBalance = Staking.getGraced(wallet);
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
        power: Staking.getPower(wallet).toFixed(),
        stakes: unixStakes,
        files,
        attributes,
        ...(username && { username }), // only adds username if it is defined
        ...(secondPublicKey && { secondPublicKey }), // same with secondPublicKey
    };
};
