import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, Database, EventEmitter, Logger, Shared, State } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Constants, Enums, Identities, Interfaces, Managers, Utils } from "@arkecosystem/crypto";
import { StakeHelpers } from "@nosplatform/stake-transactions";
import { Interfaces as StakeInterfaces } from "@nosplatform/stake-transactions-crypto";
import { q, Round, Statistic } from "@nosplatform/storage";
import { asValue } from "awilix";
import { MoreThan } from "typeorm";

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
            }

            return res;
        };

        const rounds: Array<{ forged: string; removed: string; count: number }> = [];

        const syncLatestRound = async () => {
            const lastBlock: Interfaces.IBlockData = await databaseService.connection.blocksRepository.latest();
            if (lastBlock.height > 1) {
                const roundData = roundCalculator.calculateRound(lastBlock.height);
                delete rounds[roundData.round];
                const neededBlocks = [];
                for (let i = Number(roundData.roundHeight); i <= Number(lastBlock.height); i++) {
                    neededBlocks.push(i);
                }
                const blocks = await databaseService.getBlocksByHeight(neededBlocks);

                // Cache block forged + removed in roundCache to store later in persistent SQLite storage
                for (const blockData of blocks) {
                    let forged = "0";
                    let removed = "0";
                    let count = 0;
                    if (roundData.roundHeight === 1) {
                        count = 1;
                    }
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

                    // Set the global variable's round data
                    rounds[roundData.round] = { forged: newForged, removed: newRemoved, count: newCount };
                }
            }
        };

        // After state building finishes, cache the latest round's blocks in the global "rounds" session variable.
        emitter.on(ApplicationEvents.StateBuilderFinished, async () => {
            logger.info("Bootstrapping Supply Cache");
            await syncLatestRound();
            logger.info("Bootstrapping Supply Cache Completed");
        });

        let blockEvent;
        let revertBlockEvent;
        if (options.topRewards) {
            blockEvent = "topRewards.block.applied";
            revertBlockEvent = "topRewards.block.reverted";
        } else {
            blockEvent = "block.applied";
            revertBlockEvent = "block.reverted";
        }

        emitter.on(blockEvent, async (blockData: Interfaces.IBlockData) => {
            const roundData = roundCalculator.calculateRound(blockData.height);
            let forged = "0";
            let removed = "0";
            let count = 0;
            if (roundData.roundHeight === 1) {
                count = 1;
            }
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

            // Set the global variable's round data
            rounds[roundData.round] = { forged: newForged, removed: newRemoved, count: newCount };

            if (
                rounds[roundData.round].count ===
                    Managers.configManager.getMilestone(blockData.height).activeDelegates &&
                blockData.height > 1
            ) {
                q(async () => {
                    const roundData = roundCalculator.calculateRound(blockData.height);
                    // Get data from global var cache
                    const lastSupply = Utils.BigNumber.make(supply.value);
                    const roundCache = rounds[roundData.round - 1 || 1];
                    const reward = roundCache.forged;
                    const removed = roundCache.removed;
                    // supply global state
                    supply.value = lastSupply
                        .plus(reward)
                        .minus(removed)
                        .toString();
                    // fees.removed global state
                    if (Utils.BigNumber.make(reward).isGreaterThan(Utils.BigNumber.ZERO)) {
                        removedFees.value = Utils.BigNumber.make(removedFees.value)
                            .plus(removed)
                            .toString();
                        await removedFees.save();
                    }
                    // Update Round using cached data
                    const dbRound: Round = await findOrCreate("Round", roundData.round);
                    dbRound.forged = Utils.BigNumber.make(dbRound.forged)
                        .plus(reward)
                        .toString();
                    dbRound.removed = Utils.BigNumber.make(dbRound.removed)
                        .plus(removed)
                        .toString();
                    try {
                        await dbRound.save();
                        await supply.save();
                        delete rounds[roundData.round - 1];
                        logger.info(
                            `Round ${roundData.round} applied. Supply updated. Previous: ${lastSupply.dividedBy(
                                Constants.ARKTOSHI,
                            )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                        );
                    } catch (e) {
                        throw e;
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
                    emitter.emit("top.supply.applied", roundData.round - 1);
                });
            }
        });

        emitter.on(
            "top.rewards.applied",
            async (reward: {
                rewardedDelegates: string[];
                totalReward: Utils.BigNumber;
                roundInfo: Shared.IRoundInfo;
                topDelegateReward: Utils.BigNumber;
            }) => {
                q(async () => {
                    const roundToHandle = reward.roundInfo.round;
                    // If there are top delegates: store topRewards to Round and Supply
                    if (reward.rewardedDelegates) {
                        const dbRound = await findOrCreate("Round", roundToHandle);
                        const lastSupply = Utils.BigNumber.make(supply.value);
                        supply.value = lastSupply.plus(reward.totalReward).toString();
                        dbRound.forged = Utils.BigNumber.make(dbRound.forged)
                            .plus(reward.totalReward)
                            .toString();
                        dbRound.topDelegates = reward.rewardedDelegates.join(",");
                        await dbRound.save();
                        await supply.save();
                        logger.info(
                            `Top Rewards distributed for Round ${roundToHandle}. Supply updated. Previous: ${lastSupply.dividedBy(
                                Constants.ARKTOSHI,
                            )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                        );
                    }
                    emitter.emit("top.supply.applied", reward.roundInfo.round);
                });
            },
        );

        emitter.on(
            "top.rewards.reverted",
            async (reward: {
                revertedDelegates: string[];
                totalReward: Utils.BigNumber;
                roundInfo: Shared.IRoundInfo;
                topDelegateReward: Utils.BigNumber;
            }) => {
                q(async () => {
                    const roundToHandle = reward.roundInfo.round;
                    // If there are top delegates: store topRewards to Round and Supply
                    if (reward.revertedDelegates) {
                        const dbRound = await findOrCreate("Round", roundToHandle);
                        const lastSupply = Utils.BigNumber.make(supply.value);
                        supply.value = lastSupply.minus(reward.totalReward).toString();
                        dbRound.forged = Utils.BigNumber.make(dbRound.forged)
                            .minus(reward.totalReward)
                            .toString();
                        dbRound.topDelegates = reward.revertedDelegates.join(",");
                        await dbRound.save();
                        await supply.save();
                    }
                    emitter.emit("top.supply.reverted", reward.roundInfo.round);
                });
            },
        );

        emitter.on(revertBlockEvent, async (blockData: Interfaces.IBlockData) => {
            q(async () => {
                const roundData = roundCalculator.calculateRound(blockData.height);
                if (roundCalculator.isNewRound(blockData.height)) {
                    const roundToHandle = Number(roundData.round) - 1;
                    let lastSupply: Utils.BigNumber;
                    const round = await Round.findOne(roundToHandle);
                    lastSupply = Utils.BigNumber.make(supply.value);
                    supply.value = lastSupply
                        .minus(round.forged)
                        .plus(round.removed)
                        .toString();

                    if (!Utils.BigNumber.make(round.removed).isZero()) {
                        removedFees.value = Utils.BigNumber.make(removedFees.value)
                            .minus(round.removed)
                            .toString();
                        await removedFees.save();
                    }

                    await supply.save();
                    await round.remove();

                    logger.info(
                        `Supply updated. Previous: ${lastSupply.dividedBy(
                            Constants.ARKTOSHI,
                        )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                    );

                    // Remove any rounds stored later than latest round the node reverted to
                    const laterRounds = await Round.find({ where: { id: MoreThan(roundData.round) } });
                    for (const laterRound of laterRounds) {
                        logger.info(`Round ${laterRound.id} reverted. Deleting round info. `);
                        await laterRound.remove();
                    }
                }
            });
        });

        emitter.on(
            "top.rewards.reverted",
            async (reward: {
                rewardedDelegates: string[];
                totalReward: Utils.BigNumber;
                roundInfo: Shared.IRoundInfo;
                topDelegateReward: Utils.BigNumber;
            }) => {
                q(async () => {
                    const roundToHandle = reward.roundInfo.round;
                    // If there are top delegates: store topRewards to Round and Supply
                    if (reward.rewardedDelegates) {
                        const dbRound = await findOrCreate("Round", roundToHandle);
                        const lastSupply = Utils.BigNumber.make(supply.value);
                        supply.value = lastSupply.plus(reward.totalReward).toString();
                        dbRound.forged = Utils.BigNumber.make(dbRound.forged)
                            .minus(reward.totalReward)
                            .toString();
                        dbRound.topDelegates = reward.rewardedDelegates.join(",");
                        await dbRound.save();
                        await supply.save();
                    }
                    emitter.emit("top.supply.reverted", reward.roundInfo.round);
                });
            },
        );

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
