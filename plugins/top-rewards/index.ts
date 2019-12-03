import { app } from "@arkecosystem/core-container";
import { EventEmitter, State } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { Round } from "@nosplatform/storage";
import { asValue } from "awilix";

class TopRewards {
    public static async applyReward(block: Interfaces.IBlockData, walletManager: State.IWalletManager): Promise<void> {
        const roundInfo = roundCalculator.calculateRound(block.height);
        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        if (topDelegateCount > 0) {
            const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
            const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;

            if (topDelegateReward.isGreaterThan(0)) {
                let roundDelegates;
                let delegates;
                let delegatesList = [];
                roundDelegates = await Round.findOne(roundInfo.round);
                // Check if Round exists in db, otherwise get latest active delegates
                if (roundDelegates) {
                    delegates = roundDelegates.topDelegates.split(",");
                    delegatesList = delegates;
                } else {
                    delegates = walletManager.loadActiveDelegateList(roundInfo);
                    for (const delegate of delegates) {
                        delegatesList.push(delegate.publicKey);
                    }
                }
                const rewardedDelegates = [];
                if (delegatesList.length > 0) {
                    for (let i = 0; i < topDelegateCount; i++) {
                        const delegate = walletManager.findByPublicKey(delegatesList[i]);
                        delegate.balance = delegate.balance.plus(topDelegateReward);
                        delegate.setAttribute(
                            "delegate.forgedTopRewards",
                            delegate.getAttribute<Utils.BigNumber>("delegate.forgedTopRewards").plus(topDelegateReward),
                        );
                        if (delegate.hasVoted()) {
                            const votedDelegate: State.IWallet = walletManager.findByPublicKey(
                                delegate.getAttribute("vote"),
                            );
                            votedDelegate.setAttribute(
                                "delegate.voteBalance",
                                Utils.BigNumber.make(
                                    votedDelegate
                                        .getAttribute<Utils.BigNumber>("delegate.voteBalance")
                                        .plus(topDelegateReward),
                                ),
                            );
                            walletManager.reindex(votedDelegate);
                        }
                        rewardedDelegates[i] = delegate.publicKey;
                        walletManager.reindex(delegate);
                    }
                    let tdGlobal = [];
                    if (app.has("top.delegates")) {
                        tdGlobal = app.resolve("top.delegates");
                    }
                    if (!(roundInfo.round in tdGlobal)) {
                        tdGlobal[roundInfo.round] = delegatesList;
                        app.register("top.delegates", asValue(tdGlobal));
                        console.log(app.resolve("top.delegates"));
                    }
                    this.emitter.emit("top.delegates.rewarded", rewardedDelegates, topDelegateReward);
                }
            }
        }
    }

    public static async revertReward(block: Interfaces.IBlockData, walletManager: State.IWalletManager): Promise<void> {
        const roundInfo = roundCalculator.calculateRound(block.height);
        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        if (topDelegateCount > 0) {
            const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
            const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;
            if (topDelegateReward.isGreaterThan(0)) {
                let roundDelegates;
                let delegates;
                let delegatesList = [];
                roundDelegates = await Round.findOne(roundInfo.round);
                if (roundDelegates) {
                    delegates = roundDelegates.topDelegates.split(",");
                    delegatesList = delegates;
                } else {
                    delegates = walletManager.loadActiveDelegateList(roundInfo);
                    for (const delegate of delegates) {
                        delegatesList.push(delegate.publicKey);
                    }
                }
                const rewardedDelegates = [];
                for (let i = 0; i < topDelegateCount; i++) {
                    const delegate = walletManager.findByPublicKey(delegatesList[i]);
                    delegate.balance = delegate.balance.minus(topDelegateReward);
                    delegate.setAttribute(
                        "delegate.forgedTopRewards",
                        delegate.getAttribute("delegate.forgedTopRewards").minus(topDelegateReward),
                    );
                    if (delegate.hasVoted()) {
                        const votedDelegate: State.IWallet = walletManager.findByPublicKey(
                            delegate.getAttribute("vote"),
                        );
                        votedDelegate.setAttribute(
                            "delegate.voteBalance",
                            Utils.BigNumber.make(
                                votedDelegate.getAttribute("delegate.voteBalance").minus(topDelegateReward.toFixed()),
                            ),
                        );
                        walletManager.reindex(votedDelegate);
                    }
                    rewardedDelegates[i] = delegate.publicKey;
                    walletManager.reindex(delegate);
                }
                this.emitter.emit("top.delegate.rewards.reverted", rewardedDelegates, topDelegateReward);
                let tdGlobal = [];
                if (app.has("top.delegates")) {
                    tdGlobal = app.resolve("top.delegates");
                }
                if (roundInfo.round in tdGlobal) {
                    delete tdGlobal[roundInfo.round];
                    app.register("top.delegates", asValue(tdGlobal));
                }
            }
        }
    }

    private static readonly emitter: EventEmitter.EventEmitter = app.resolvePlugin<EventEmitter.EventEmitter>(
        "event-emitter",
    );
}

export { TopRewards };
