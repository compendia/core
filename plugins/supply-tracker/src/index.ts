import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger, Shared, State } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Constants, Enums, Identities, Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { StakeHelpers } from "@nosplatform/stake-transactions";
import { Interfaces as StakeInterfaces } from "@nosplatform/stake-transactions-crypto";
import { Delegate, q, Round, Statistic } from "@nosplatform/storage";
import { TopRewards } from "@nosplatform/top-rewards";
import { asValue } from "awilix";
import { createHandyClient } from "handy-redis";
import { MoreThan } from "typeorm";

const redis = createHandyClient();
const defaults = {};
const logger = app.resolvePlugin<Logger.ILogger>("logger");
const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
const databaseService: Database.IDatabaseService = app.resolvePlugin<Database.IDatabaseService>("database");
const blocksRepository: Database.IBlocksBusinessRepository = databaseService.blocksBusinessRepository;

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "supply-tracker",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Supply Tracker.`);
        let roundsCleaned;

        /**
         * Bootstrap Database
         */

        let supply = await Statistic.findOne({ name: "supply" });
        if (!supply) {
            logger.info("Initialize supply.");
            supply = new Statistic();
            supply.name = "supply";
            supply.value = "0";
            await supply.save();
        }

        let removedFees = await Statistic.findOne({ name: "removed" });
        if (!removedFees) {
            logger.info("Initialize removed.");
            removedFees = new Statistic();
            removedFees.name = "removed";
            removedFees.value = "0";
            await removedFees.save();
        }

        let staked = await Statistic.findOne({ name: "staked" });
        if (!staked) {
            logger.info("Initialize staked.");
            staked = new Statistic();
            staked.name = "staked";
            staked.value = "0";
            await staked.save();
        }

        let totalStakePower = await Statistic.findOne({ name: `stakePower` });
        if (!totalStakePower) {
            totalStakePower = new Statistic();
            totalStakePower.name = `stakePower`;
            totalStakePower.value = "0";
            await totalStakePower.save();
        }

        const findOrCreate = async (model, id) => {
            let res;
            switch (model) {
                case "Round":
                    let round = await Round.findOne(id);
                    if (!round) {
                        round = new Round();
                        round.id = id;
                        round.removed = "0";
                        round.staked = "0";
                        round.forged = "0";
                        round.topDelegates = "";
                        round.released = "0";
                    }
                    res = round;
                    break;

                case "Delegate":
                    let delegate = await Delegate.findOne({ where: { publicKey: id } });
                    if (!delegate) {
                        delegate = new Delegate();
                        delegate.publicKey = id;
                        delegate.topRewards = "0";
                    }
                    res = delegate;
                    break;
            }

            return res;
        };

        /**
         * Event Listeners
         */

        const getTopDelegates = (roundData: Shared.IRoundInfo) => {
            const topDelegateCount = Managers.configManager.getMilestone(roundData.round).topDelegates;
            const topDelegates = [];
            let i = 0;
            let delegates = [];
            const getDelegates = () => {
                let delegates = [];
                try {
                    delegates = databaseService.walletManager.loadActiveDelegateList(roundData);
                } catch (e) {
                    throw new Error(e);
                }
                return delegates;
            };

            delegates = getDelegates();

            for (const delegate of delegates) {
                if (i < topDelegateCount) {
                    topDelegates.push(delegate.publicKey);
                } else {
                    break;
                }
                i++;
            }

            return topDelegates;
        };

        // Global rounds store for applying forged + removed on newRound (count === 47)
        const rounds: Array<{ forged; removed; count }> = [];

        // Function to apply top rewards & cache round data
        const handleCacheAndTopRewards = async (blockData: Interfaces.IBlockData) => {
            const roundData = roundCalculator.calculateRound(blockData.height);
            let forged = 0;
            let removed = 0;
            let count = 0;
            const roundCache = rounds[roundData.round];
            if (roundCache) {
                forged = roundCache.forged;
                removed = roundCache.removed;
                count = roundCache.count;
            }
            const newForged = Utils.BigNumber.make(forged)
                .plus(blockData.reward)
                .toFixed();
            const newRemoved = Utils.BigNumber.make(removed)
                .plus(blockData.removedFee)
                .toFixed();
            const newCount = count + 1;
            rounds[roundData.round] = { forged: newForged, removed: newRemoved, count: newCount };

            // Pay out Top Rewards & cache the data for later caching in SQLite Storage
            const hasTopReward = !Utils.BigNumber.make(blockData.topReward).isZero();
            if (hasTopReward && (roundData.roundHeight === blockData.height || blockData.height === 2)) {
                const topDelegates = getTopDelegates(roundData);
                await redis.set(`topDelegates:${Number(roundData.round)}`, topDelegates.join(","));
                const lastTop = await redis.get(`topDelegates:${Number(roundData.round) - 1}`);
                if (Number(roundData.round) > 1 && lastTop) {
                    const reward = await TopRewards.applyTopRewardsForRound(Number(roundData.roundHeight) - 1, lastTop);
                    if (reward) {
                        await redis.hmset(
                            `rewards:${Number(reward.roundInfo.round)}`,
                            ["rewardedDelegates", reward.rewardedDelegates.join(",")],
                            ["totalReward", reward.totalReward.toString()],
                            ["round", reward.roundInfo.round],
                        );
                    }
                }
            }
        };

        const syncLatestRound = async () => {
            const lastBlock: Interfaces.IBlockData = await databaseService.connection.blocksRepository.latest();
            if (lastBlock.height > 1) {
                const roundData = roundCalculator.calculateRound(lastBlock.height);
                await redis.del(`topDelegates:${Number(roundData.round)}`);
                await redis.del(`rewards:${Number(roundData.round)}`);
                delete rounds[roundData.round];
                const neededBlocks = [];
                for (let i = Number(roundData.roundHeight); i <= Number(lastBlock.height); i++) {
                    neededBlocks.push(i);
                }
                const blocks = await databaseService.getBlocksByHeight(neededBlocks);

                // Cache block forged + removed in roundCache to store later in persistent SQLite storage
                for (const blockData of blocks) {
                    await handleCacheAndTopRewards(blockData);
                }
            }
        };

        emitter.on(ApplicationEvents.StateBuilderFinished, async () => {
            await TopRewards.bootstrap();
            await syncLatestRound();
        });

        // let missedRounds: string[] = [];
        // emitter.on(ApplicationEvents.RoundMissed, async (delegate: State.IWallet) => {
        //     const lastBlock = await databaseService.connection.blocksRepository.latest();
        //     const round = roundCalculator.calculateRound(lastBlock.height);
        //     missedRounds[round.round] = delegate.publicKey;
        // });

        // On new block
        emitter.on("block.applied", async (blockData: Interfaces.IBlockData) => {
            await handleCacheAndTopRewards(blockData);

            q(async () => {
                const roundData = roundCalculator.calculateRound(blockData.height);
                const roundToHandle = Number(roundData.round) - 1;
                const roundCache = rounds[roundToHandle];
                if (
                    roundCache &&
                    roundCache.count === Number(Managers.configManager.getMilestone(roundToHandle).activeDelegates) &&
                    blockData.height > 1
                ) {
                    // Get data from redis cache
                    const lastSupply = Utils.BigNumber.make(supply.value);
                    const forged = roundCache.forged;
                    const removed = roundCache.removed;

                    // supply global state

                    supply.value = lastSupply
                        .plus(forged)
                        .minus(removed)
                        .toString();

                    // fees.removed global state
                    if (Utils.BigNumber.make(removed).isGreaterThan(Utils.BigNumber.ZERO)) {
                        removedFees.value = Utils.BigNumber.make(removedFees.value)
                            .plus(removed)
                            .toString();
                        await removedFees.save();
                    }

                    // Update Round using cached data
                    const round = await findOrCreate("Round", roundToHandle);
                    round.forged = Utils.BigNumber.make(round.forged)
                        .plus(forged)
                        .toString();
                    round.removed = Utils.BigNumber.make(round.removed)
                        .plus(removed)
                        .toString();

                    // If there are top delegates: distribute and store topRewards
                    const topDelegates = await redis.get(`topDelegates:${roundToHandle}`);
                    if (topDelegates) {
                        const reward = await redis.hmget(
                            `rewards:${roundToHandle}`,
                            "totalReward",
                            "rewardedDelegates",
                        );
                        if (reward && !Utils.BigNumber.make(reward[0] || 0).isZero()) {
                            const lastSupply = Utils.BigNumber.make(supply.value);
                            supply.value = lastSupply.plus(reward[0]).toString();
                            round.forged = Utils.BigNumber.make(round.forged)
                                .plus(reward[0])
                                .toString();
                            round.topDelegates = topDelegates;

                            // Store each individual delegate's reward to their publicKey in SQLite
                            for (const publicKey of reward[1].split(",")) {
                                const delegate = await findOrCreate("Delegate", publicKey);
                                const delegateRewards = Utils.BigNumber.make(
                                    databaseService.walletManager
                                        .findByPublicKey(publicKey)
                                        .getAttribute("delegate.forgedTopRewards"),
                                ).toString();
                                if (delegate.topRewards !== Utils.BigNumber.make(delegateRewards).toString()) {
                                    delegate.topRewards = delegateRewards;
                                    await delegate.save();
                                }
                            }
                        }
                    }

                    await redis.del(`rewards:${roundToHandle}`);
                    await redis.del(`topDelegates:${roundToHandle}`);
                    delete rounds[roundToHandle];

                    await round.save();
                    await supply.save();

                    logger.info(
                        `Round ${roundToHandle} applied. Supply updated. Previous: ${lastSupply.dividedBy(
                            Constants.ARKTOSHI,
                        )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                    );
                }

                // After the first block, remove any rounds stored later than latest round on the node
                if (!roundsCleaned) {
                    const laterRounds = await Round.find({ where: { id: MoreThan(roundData.round) } });
                    for (const laterRound of laterRounds) {
                        logger.info(`Round ${laterRound.id} doesn't exist yet. Deleting round info. `);
                        await laterRound.remove();
                    }
                    roundsCleaned = true;
                }

                app.register("supply.lastblock", asValue(blockData.height));
            });
        });

        // Function to apply top rewards & cache round data
        const handleRevertCacheAndTopRewards = async (blockData: Interfaces.IBlockData) => {
            const roundData = roundCalculator.calculateRound(blockData.height);
            let forged = 0;
            let removed = 0;
            let count = 0;
            const roundCache = rounds[roundData.round];
            if (roundCache) {
                forged = roundCache.forged;
                removed = roundCache.removed;
                count = roundCache.count;
            }
            const newForged = Utils.BigNumber.make(forged)
                .minus(blockData.reward)
                .toFixed();
            const newRemoved = Utils.BigNumber.make(removed)
                .minus(blockData.removedFee)
                .toFixed();
            const newCount = count - 1;
            rounds[roundData.round] = { forged: newForged, removed: newRemoved, count: newCount };

            // Pay out Top Rewards & cache the data for later caching in SQLite Storage
            const hasTopReward = !Utils.BigNumber.make(blockData.topReward).isZero();
            if (hasTopReward && (roundData.roundHeight === blockData.height || blockData.height === 2)) {
                const topDelegates = getTopDelegates(roundData);
                await redis.set(`topDelegates:${Number(roundData.round)}`, topDelegates.join(","));
                const lastTop = await redis.get(`topDelegates:${Number(roundData.round) - 1}`);
                if (Number(roundData.round) > 1 && lastTop) {
                    const reward = await TopRewards.revertTopRewardsForRound(
                        Number(roundData.roundHeight) - 1,
                        lastTop,
                    );
                    if (reward) {
                        await redis.hmset(
                            `rewards:${Number(reward.roundInfo.round)}`,
                            ["rewardedDelegates", reward.rewardedDelegates.join(",")],
                            ["totalReward", reward.totalReward.toString()],
                            ["round", reward.roundInfo.round],
                        );
                    }
                }
            }
        };

        emitter.on("block.reverted", async (blockData: Interfaces.IBlockData) => {
            const roundData = roundCalculator.calculateRound(blockData.height);
            const round = await Round.findOne(roundData.round);
            rounds[roundData.round] = {
                forged: round.forged,
                removed: round.removed,
                count: Number(Managers.configManager.getMilestone(roundData.roundHeight).activeDelegates),
            };
            await handleRevertCacheAndTopRewards(blockData);

            q(async () => {
                if (roundData.roundHeight === blockData.height && blockData.height > 1) {
                    const roundToHandle = Number(roundData.round) - 1;
                    const round = await Round.findOne(roundToHandle);

                    const lastSupply = Utils.BigNumber.make(supply.value);
                    supply.value = lastSupply
                        .minus(round.forged)
                        .plus(round.removed)
                        .toString();
                    await supply.save();

                    if (!Utils.BigNumber.make(round.removed).isZero()) {
                        removedFees.value = Utils.BigNumber.make(removedFees.value)
                            .minus(round.removed)
                            .toString();
                        await removedFees.save();
                    }

                    const topDelegates = await redis.get(`topDelegates:${roundToHandle}`);
                    if (topDelegates) {
                        const reward = await redis.hmget(
                            `rewards:${roundToHandle}`,
                            "totalReward",
                            "rewardedDelegates",
                        );
                        if (reward && !Utils.BigNumber.make(reward[0] || 0).isZero()) {
                            const lastSupply = Utils.BigNumber.make(supply.value);
                            supply.value = lastSupply.minus(reward[0]).toString();
                            // Store each individual delegate's reward to their publicKey in SQLite
                            for (const publicKey of reward[1].split(",")) {
                                const delegate = await Delegate.findOne({ where: { publicKey } });
                                const delegateRewards = Utils.BigNumber.make(
                                    databaseService.walletManager
                                        .findByPublicKey(publicKey)
                                        .getAttribute("delegate.forgedTopRewards"),
                                ).toString();
                                if (delegate.topRewards !== Utils.BigNumber.make(delegateRewards).toString()) {
                                    delegate.topRewards = delegateRewards;
                                    await delegate.save();
                                }
                            }
                        }
                    }

                    await round.remove();

                    logger.info(
                        `Supply updated. Previous: ${lastSupply.dividedBy(
                            Constants.ARKTOSHI,
                        )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                    );
                }

                // Remove any rounds stored later than latest round the node reverted to
                const laterRounds = await Round.find({ where: { id: MoreThan(roundData.round) } });
                for (const laterRound of laterRounds) {
                    logger.info(`Round ${laterRound.id} reverted. Deleting round info. `);
                    await laterRound.remove();
                }
            });
        });

        // All transfers from the mint wallet are added to supply
        emitter.on(ApplicationEvents.TransactionApplied, async txData => {
            q(async () => {
                const genesisBlock: Interfaces.IBlockData = app.getConfig().all().genesisBlock;
                const tx: Interfaces.ITransactionData = txData;
                const senderAddress = Identities.Address.fromPublicKey(tx.senderPublicKey);
                let lastBlock: Interfaces.IBlockData = await blocksRepository.findById(tx.blockId);
                if (!lastBlock) {
                    lastBlock = app
                        .resolvePlugin<State.IStateService>("state")
                        .getStore()
                        .getLastBlock().data;
                }
                const roundData = roundCalculator.calculateRound(lastBlock.height);
                const round = await findOrCreate("Round", roundData.round);
                if (
                    tx.typeGroup === Enums.TransactionTypeGroup.Core &&
                    tx.type === Enums.TransactionType.Transfer &&
                    tx.blockId !== genesisBlock.id
                ) {
                    if (senderAddress === genesisBlock.transactions[0].recipientId) {
                        // Add coins to supply when sent from mint address
                        supply.value = Utils.BigNumber.make(supply.value)
                            .plus(tx.amount)
                            .toString();
                        await supply.save();

                        // Save round data
                        round.forged = Utils.BigNumber.make(round.forged)
                            .plus(tx.amount)
                            .toString();

                        await round.save();
                        logger.info(
                            `Transaction from mint wallet: ${tx.amount.toString()} added to supply. New supply: ${
                                supply.value
                            }`,
                        );
                    } else if (tx.recipientId === genesisBlock.transactions[0].recipientId) {
                        // Remove coins from supply when sent to mint address
                        supply.value = Utils.BigNumber.make(supply.value)
                            .minus(tx.amount)
                            .toString();
                        await supply.save();
                        // Save round data
                        round.forged = Utils.BigNumber.make(round.forged)
                            .minus(tx.amount)
                            .toString();

                        await round.save();
                    }
                }
            });
        });

        // On stake create
        emitter.on("stake.created", async txData => {
            q(async () => {
                const tx: Interfaces.ITransactionData = txData;
                const o: StakeInterfaces.IStakeObject = StakeHelpers.VotePower.stakeObject(tx.asset.stakeCreate, tx.id);
                const lastSupply = Utils.BigNumber.make(supply.value);

                supply.value = lastSupply.minus(o.amount).toString();
                staked.value = Utils.BigNumber.make(staked.value)
                    .plus(o.amount)
                    .toString();

                await supply.save();
                await staked.save();
                // Save round data
                let lastBlock: Interfaces.IBlockData = await blocksRepository.findById(tx.blockId);
                if (!lastBlock) {
                    lastBlock = app
                        .resolvePlugin<State.IStateService>("state")
                        .getStore()
                        .getLastBlock().data;
                }
                const roundData = roundCalculator.calculateRound(lastBlock.height);

                const round = await findOrCreate("Round", roundData.round);
                round.staked = Utils.BigNumber.make(round.staked)
                    .plus(o.amount)
                    .toString();
                await round.save();

                // Save duration-specific stake stat
                let stat = await Statistic.findOne({ name: `stakes.${o.duration}` });
                if (!stat) {
                    stat = new Statistic();
                    stat.name = `stakes.${o.duration}`;
                    stat.value = "0";
                }
                stat.value = Utils.BigNumber.make(stat.value)
                    .plus(o.amount)
                    .toFixed();
                await stat.save();

                totalStakePower.value = Utils.BigNumber.make(totalStakePower.value)
                    .plus(o.power)
                    .toString();
                await totalStakePower.save();

                logger.info(
                    `Stake created at block ${lastBlock.height}. Supply updated. Previous: ${lastSupply.dividedBy(
                        Constants.ARKTOSHI,
                    )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                );
            });
        });

        // On stake release
        emitter.on("stake.released", async stakeObj => {
            q(async () => {
                const walletManager = app.resolvePlugin("database").walletManager;
                const sender = walletManager.findByPublicKey(stakeObj.publicKey);
                const txId = stakeObj.stakeKey;
                const block: Interfaces.IBlockData = stakeObj.block;
                const stake: StakeInterfaces.IStakeObject = sender.getAttribute("stakes")[txId];
                const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);

                supply.value = lastSupply.plus(stake.amount).toString();
                staked.value = Utils.BigNumber.make(staked.value)
                    .minus(stake.amount)
                    .toString();

                await supply.save();
                await staked.save();

                // Save round data
                const roundData = roundCalculator.calculateRound(block.height);
                const round = await findOrCreate("Round", roundData.round);
                round.released = Utils.BigNumber.make(round.released)
                    .plus(stake.amount)
                    .toString();
                await round.save();

                // Save duration-specific stake stat
                let stat = await Statistic.findOne({ name: `stakes.${stake.duration}` });
                if (!stat) {
                    stat = new Statistic();
                    stat.name = `stakes.${stake.duration}`;
                    stat.value = stake.amount.toString();
                }
                stat.value = Utils.BigNumber.make(stat.value)
                    .minus(stake.amount)
                    .toFixed();
                await stat.save();

                totalStakePower.value = Utils.BigNumber.make(totalStakePower.value)
                    .minus(stakeObj.prevStakePower)
                    .plus(stake.power)
                    .toString();
                await totalStakePower.save();

                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(
                        Constants.ARKTOSHI,
                    )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                );
            });
        });

        emitter.on(ApplicationEvents.TransactionReverted, async txObj => {
            const tx: Interfaces.ITransactionData = txObj;
            // On stake revert
            if (tx.typeGroup === 100 && tx.type === 0) {
                const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);
                const o: StakeInterfaces.IStakeObject = StakeHelpers.VotePower.stakeObject(tx.asset.stakeCreate, tx.id);

                supply.value = lastSupply.plus(tx.asset.stakeCreate.amount).toString();
                staked.value = Utils.BigNumber.make(staked.value)
                    .minus(tx.asset.stakeCreate.amount)
                    .toString();

                totalStakePower.value = Utils.BigNumber.make(totalStakePower.value)
                    .minus(o.power)
                    .toString();

                await supply.save();
                await staked.save();
                await totalStakePower.save();

                // Save round data
                const lastBlock: Interfaces.IBlockData = await blocksRepository.findById(tx.blockId);

                const roundData = roundCalculator.calculateRound(lastBlock.height);
                const round = await findOrCreate("Round", roundData.round);

                if (round) {
                    round.staked = Utils.BigNumber.make(round.staked)
                        .minus(tx.asset.stakeCreate.amount)
                        .toString();
                    await round.save();
                }

                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(
                        Constants.ARKTOSHI,
                    )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                );
            } else if (tx.typeGroup === 100 && tx.type === 1) {
                // If stake redeem is reverted, update global stats
                const walletManager = app.resolvePlugin("database").walletManager;
                const sender = walletManager.findByPublicKey(tx.senderPublicKey);
                const txId = tx.asset.stakeRedeem.id;
                const stakes = sender.getAttribute("stakes", {});
                const stake = stakes[txId];
                if (Object.keys(stake).length) {
                    const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);
                    supply.value = lastSupply.minus(tx.asset.stakeCreate.amount).toString();
                    staked.value = Utils.BigNumber.make(staked.value)
                        .plus(tx.asset.stakeCreate.amount)
                        .toString();
                    totalStakePower.value = Utils.BigNumber.make(totalStakePower.value)
                        .plus(stake.power)
                        .toString();
                    await supply.save();
                    await staked.save();
                    await totalStakePower.save();
                    logger.info(
                        `Supply updated. Previous: ${lastSupply.dividedBy(
                            Constants.ARKTOSHI,
                        )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                    );
                }
            }
        });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Supply Tracker.`);
    },
};
