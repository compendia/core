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

        if (topDelegateCount.isGreaterThan(0)) {
            const balanceWeightMultiplierVal = Managers.configManager.getMilestone(block.height).balanceVoteWeight;
            const balanceWeightMultiplier = balanceWeightMultiplierVal
                ? balanceWeightMultiplierVal
                : Utils.BigNumber.ZERO;
            const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
            const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;

            if (topDelegateReward.isGreaterThan(0)) {
                const roundDelegates = await Round.findOne(roundInfo.round);
                const delegates = roundDelegates.topDelegates.split(",");
                const rewardedDelegates = [];
                for (let i = 0; i < topDelegateCount; i++) {
                    const delegate = walletManager.findByPublicKey(delegates[i]);
                    delegate.balance = delegate.balance.plus(topDelegateReward);
                    delegate.setAttribute(
                        "forgedTopRewards",
                        delegate.getAttribute<Utils.BigNumber>("forgedTopRewards").plus(topDelegateReward),
                    );
                    if (delegate.hasVoted()) {
                        const votedDelegate: State.IWallet = walletManager.findByPublicKey(
                            delegate.getAttribute("vote"),
                        );
                        votedDelegate.setAttribute(
                            "voteBalance",
                            Utils.BigNumber.make(
                                votedDelegate
                                    .getAttribute<Utils.BigNumber>("voteBalance")
                                    .plus(topDelegateReward.times(balanceWeightMultiplier).toFixed()),
                            ),
                        );
                        walletManager.reindex(votedDelegate);
                    }
                    rewardedDelegates[i] = delegate.publicKey;
                    walletManager.reindex(delegate);
                }
                this.emitter.emit("top.delegates.rewarded", rewardedDelegates, topDelegateReward);
                let tdGlobal = [];
                if (app.has("top.delegates")) {
                    tdGlobal = app.resolve("top.delegates");
                }
                if (roundInfo.round in tdGlobal) {
                    tdGlobal[roundInfo.round] = rewardedDelegates;
                    app.register("top.delegates", asValue(tdGlobal));
                }
            }
        }
    }

    public static async revertReward(block: Interfaces.IBlockData, walletManager: State.IWalletManager): Promise<void> {
        const roundInfo = roundCalculator.calculateRound(block.height);
        const topDelegateCountVal = Managers.configManager.getMilestone(block.height).topDelegates;
        const topDelegateCount = topDelegateCountVal ? topDelegateCountVal : Utils.BigNumber.ZERO;

        if (topDelegateCount.isGreaterThan(0)) {
            const topDelegateRewardVal = Utils.BigNumber.make(block.topReward).dividedBy(topDelegateCount);
            const topDelegateReward = topDelegateRewardVal ? topDelegateRewardVal : Utils.BigNumber.ZERO;
            const balanceWeightMultiplierVal = Managers.configManager.getMilestone(block.height).balanceVoteWeight;
            const balanceWeightMultiplier = balanceWeightMultiplierVal
                ? balanceWeightMultiplierVal
                : Utils.BigNumber.ZERO;
            if (topDelegateReward.isGreaterThan(0)) {
                const roundDelegates = await Round.findOne(roundInfo.round);
                const delegates = roundDelegates.topDelegates.split(",");
                const rewardedDelegates = [];
                for (let i = 0; i < topDelegateCount; i++) {
                    const delegate = walletManager.findByPublicKey(delegates[i]);
                    delegate.balance = delegate.balance.minus(topDelegateReward);
                    delegate.setAttribute(
                        "forgedTopRewards",
                        delegate.getAttribute("forgedTopRewards").minus(topDelegateReward),
                    );
                    if (delegate.hasVoted()) {
                        const votedDelegate: State.IWallet = walletManager.findByPublicKey(
                            delegate.getAttribute("vote"),
                        );
                        votedDelegate.setAttribute(
                            "voteBalance",
                            Utils.BigNumber.make(
                                votedDelegate
                                    .getAttribute("voteBalance")
                                    .minus(topDelegateReward.times(balanceWeightMultiplier).toFixed()),
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
