import { app } from "@arkecosystem/core-container";
import { Container, Database, EventEmitter, Logger, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Managers, Utils } from "@arkecosystem/crypto";
import { Delegate } from "@nosplatform/storage";

const defaults = {};

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "top-rewards",
    async register(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Bootstrapping Top Rewards");
        container.resolvePlugin<Logger.ILogger>("logger").info("Top Rewards Bootstrapping Complete");
    },
    async deregister(container: Container.IContainer, options) {
        container.resolvePlugin<Logger.ILogger>("logger").info("Deregistering Top Rewards Plugin");
    },
};

class TopRewards {
    public static async applyTopRewardsForRound(
        roundHeight: number,
        lastTop: string,
        emitEvents: boolean = true,
    ): Promise<{ rewardedDelegates; totalReward; roundInfo; topDelegateReward } | void> {
        const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
            "transaction-pool",
        );
        const roundInfo = roundCalculator.calculateRound(roundHeight);
        const delegatesCount = Managers.configManager.getMilestone(roundInfo.roundHeight).activeDelegates;
        const topReward = Managers.configManager.getMilestone(roundInfo.roundHeight).topReward;
        const topDelegatesStr = lastTop;
        if (topDelegatesStr) {
            const topDelegates = topDelegatesStr.split(",");

            const topDelegateReward = Utils.BigNumber.make(topReward)
                .dividedBy(topDelegates.length)
                .times(delegatesCount);

            const rewardedDelegates = [];
            let totalReward = Utils.BigNumber.ZERO;
            if (topDelegates.length) {
                for (const publicKey of topDelegates) {
                    const delegate = databaseService.walletManager.findByPublicKey(publicKey);
                    const poolDelegate = poolService.walletManager.findByPublicKey(publicKey);
                    const delegateLastBlock = delegate.getAttribute("delegate.lastBlock", { height: 0 });
                    if (Number(delegateLastBlock.height) > 0) {
                        const delegateLastRound = roundCalculator.calculateRound(delegateLastBlock.height);
                        if (delegateLastRound.round >= roundInfo.round) {
                            this.addRewards(delegate, topDelegateReward, databaseService.walletManager);
                            this.addRewards(poolDelegate, topDelegateReward, poolService.walletManager);
                            rewardedDelegates.push(publicKey);
                            totalReward = totalReward.plus(topDelegateReward);
                        }
                    }
                }

                if (emitEvents) {
                    app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter").emit("top.delegates.rewarded", {
                        rewardedDelegates,
                        totalReward,
                        roundInfo,
                        topDelegateReward,
                    });
                }

                return {
                    rewardedDelegates,
                    totalReward,
                    roundInfo,
                    topDelegateReward,
                };
            }
        }
        return undefined;
    }

    public static async revertTopRewardsForRound(
        round: number,
        lastTop: string,
        emitEvents: boolean = true,
    ): Promise<{ rewardedDelegates; totalReward; roundInfo } | void> {
        const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const poolService: TransactionPool.IConnection = app.resolvePlugin<TransactionPool.IConnection>(
            "transaction-pool",
        );
        const roundInfo = roundCalculator.calculateRound(round);
        const delegatesCount = Managers.configManager.getMilestone(round).activeDelegates;
        const topReward = Managers.configManager.getMilestone(round).topReward;
        const topDelegatesStr = lastTop;
        if (topDelegatesStr) {
            const topDelegates = topDelegatesStr.split(",");

            const topDelegateReward = Utils.BigNumber.make(topReward)
                .dividedBy(topDelegates.length)
                .times(delegatesCount);

            const rewardedDelegates = [];
            let totalReward = Utils.BigNumber.ZERO;
            if (topDelegates.length) {
                for (const publicKey of topDelegates) {
                    const delegate = databaseService.walletManager.findByPublicKey(publicKey);
                    const poolDelegate = poolService.walletManager.findByPublicKey(publicKey);
                    const delegateLastBlock = delegate.getAttribute("delegate.lastBlock", { height: 0 });
                    if (Number(delegateLastBlock.height) > 0) {
                        const delegateLastRound = roundCalculator.calculateRound(delegateLastBlock.height);
                        if (delegateLastRound.round >= roundInfo.round) {
                            this.removeRewards(delegate, topDelegateReward, databaseService.walletManager);
                            this.removeRewards(poolDelegate, topDelegateReward, poolService.walletManager);
                            rewardedDelegates.push(publicKey);
                            totalReward = totalReward.plus(topDelegateReward);
                        }
                    }
                }

                if (emitEvents) {
                    app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter").emit(
                        "top.delegates.rewards.reverted",
                        {
                            rewardedDelegates,
                            totalReward,
                            roundInfo,
                        },
                    );
                }

                return {
                    rewardedDelegates,
                    totalReward,
                    roundInfo,
                };
            }
        }
        return undefined;
    }

    public static async bootstrap(publicKey: string, walletManager: State.IWalletManager): Promise<void> {
        const dbDelegate: Delegate = await Delegate.findOne({ where: { publicKey } });
        if (dbDelegate) {
            const topReward = Utils.BigNumber.make(dbDelegate.topRewards);
            const delegate = walletManager.findByPublicKey(dbDelegate.publicKey);
            this.addRewards(delegate, topReward, walletManager);
        }
    }

    private static addRewards(delegate: State.IWallet, topDelegateReward, walletManager) {
        delegate.balance = delegate.balance.plus(topDelegateReward);
        delegate.setAttribute(
            "delegate.forgedTopRewards",
            delegate
                .getAttribute<Utils.BigNumber>("delegate.forgedTopRewards", Utils.BigNumber.ZERO)
                .plus(topDelegateReward),
        );
        if (delegate.hasVoted()) {
            const votedDelegate: State.IWallet = walletManager.findByPublicKey(delegate.getAttribute("vote"));
            votedDelegate.setAttribute(
                "delegate.voteBalance",
                Utils.BigNumber.make(
                    votedDelegate.getAttribute("delegate.voteBalance").plus(topDelegateReward.toFixed()),
                ),
            );
            walletManager.reindex(votedDelegate);
        }
        walletManager.reindex(delegate);
    }

    private static removeRewards(delegate: State.IWallet, topDelegateReward, walletManager) {
        delegate.balance = delegate.balance.minus(topDelegateReward);
        delegate.setAttribute(
            "delegate.forgedTopRewards",
            delegate.getAttribute("delegate.forgedTopRewards").minus(topDelegateReward.toFixed()),
        );
        if (delegate.hasVoted()) {
            const votedDelegate: State.IWallet = walletManager.findByPublicKey(delegate.getAttribute("vote"));
            votedDelegate.setAttribute(
                "delegate.voteBalance",
                Utils.BigNumber.make(
                    votedDelegate.getAttribute("delegate.voteBalance").minus(topDelegateReward.toFixed()),
                ),
            );
            walletManager.reindex(votedDelegate);
        }
        walletManager.reindex(delegate);
    }
}

export { TopRewards };
