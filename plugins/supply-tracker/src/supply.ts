import { app } from "@arkecosystem/core-container";
import { ApplicationEvents } from "@arkecosystem/core-event-emitter";
import { Container, EventEmitter, Logger } from "@arkecosystem/core-interfaces";
import { Enums, Identities, Interfaces, Utils } from "@arkecosystem/crypto";
import { Constants } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { StakeHelpers } from "@nosplatform/stake-transactions";
import { defaults } from "./defaults";

const logger = app.resolvePlugin<Logger.ILogger>("logger");
const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

import { Statistic } from "@nosplatform/storage";

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "supply-tracker",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Supply Tracker.`);

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

        /**
         * Event Listeners
         */

        // On new block
        emitter.on("block.forged", async block => {
            const blockData: Interfaces.IBlockData = block;
            // supply global state
            const lastSupply = Utils.BigNumber.make(supply.value);
            supply.value = lastSupply
                .plus(blockData.reward)
                .plus(blockData.topReward)
                .minus(blockData.removedFee)
                .toString();
            await supply.save();
            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${Utils.BigNumber.make(
                    supply.value,
                ).dividedBy(Constants.ARKTOSHI)}`,
            );
            // fees.removed global state
            if (Utils.BigNumber.make(blockData.removedFee).isGreaterThan(Utils.BigNumber.ZERO)) {
                removedFees.value = Utils.BigNumber.make(removedFees.value)
                    .plus(blockData.removedFee)
                    .toString();
                await removedFees.save();
            }
        });

        // All transfers from the mint wallet are added to supply
        emitter.on(ApplicationEvents.TransactionForged, async txData => {
            const genesisBlock: Interfaces.IBlockData = app.getConfig().all().genesisBlock;
            const tx: Interfaces.ITransactionData = txData;
            const senderAddress = Identities.Address.fromPublicKey(tx.senderPublicKey);
            if (tx.type === Enums.TransactionTypes.Transfer && tx.blockId !== genesisBlock.id) {
                if (senderAddress === genesisBlock.transactions[0].recipientId) {
                    // Add coins to supply when sent from mint address
                    supply.value = Utils.BigNumber.make(supply.value)
                        .plus(tx.amount)
                        .toString();
                    logger.info(
                        `Transaction from mint wallet: ${tx.amount.toString()} added to supply. New supply: ${
                            supply.value
                        }`,
                    );
                    await supply.save();
                } else if (tx.recipientId === genesisBlock.transactions[0].recipientId) {
                    // Remove coins from supply when sent to mint address
                    supply.value = Utils.BigNumber.make(supply.value)
                        .minus(tx.amount)
                        .toString();
                    await supply.save();
                }
            }
        });

        emitter.on("block.reverted", async block => {
            const blockData: Interfaces.IBlockData = block;
            const lastSupply = Utils.BigNumber.make(supply.value);
            supply.value = lastSupply
                .minus(blockData.reward)
                .minus(blockData.topReward)
                .plus(blockData.removedFee)
                .toString();
            await supply.save();
            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${Utils.BigNumber.make(
                    supply.value,
                ).dividedBy(Constants.ARKTOSHI)}`,
            );
            if (blockData.removedFee.isGreaterThan(Utils.BigNumber.ZERO)) {
                removedFees.value = Utils.BigNumber.make(removedFees.value)
                    .minus(blockData.removedFee)
                    .toString();
                removedFees.save();
            }
        });

        // On stake create
        emitter.on("stake.created", async tx => {
            const o: StakeInterfaces.IStakeObject = StakeHelpers.VoteWeight.stakeObject(tx);
            const lastSupply = Utils.BigNumber.make(supply.value);

            supply.value = lastSupply.minus(o.amount).toString();
            staked.value = Utils.BigNumber.make(staked.value)
                .plus(o.amount)
                .toString();

            await supply.save();
            await staked.save();

            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${Utils.BigNumber.make(
                    supply.value,
                ).dividedBy(Constants.ARKTOSHI)}`,
            );
        });

        // On stake create
        emitter.on("stake.expired", async stakeObj => {
            const walletManager = app.resolvePlugin("database").walletManager;
            const sender = walletManager.findByPublicKey(stakeObj.publicKey);
            const blockTime = stakeObj.stakeKey;
            const stake: StakeInterfaces.IStakeObject = sender.stake[blockTime];
            const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);

            supply.value = lastSupply.plus(stake.amount).toString();
            staked.value = Utils.BigNumber.make(staked.value)
                .minus(stake.amount)
                .toString();

            await supply.save();
            await staked.save();

            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${Utils.BigNumber.make(
                    supply.value,
                ).dividedBy(Constants.ARKTOSHI)}`,
            );
        });

        emitter.on(ApplicationEvents.TransactionReverted, async txObj => {
            const tx: Interfaces.ITransactionData = txObj;
            // On stake revert
            if (tx.type === 100) {
                const lastSupply: Utils.BigNumber = Utils.BigNumber.make(supply.value);

                supply.value = lastSupply.plus(tx.asset.stakeCreate.amount).toString();
                staked.value = Utils.BigNumber.make(staked.value)
                    .minus(tx.asset.stakeCreate.amount)
                    .toString();

                await supply.save();
                await staked.save();

                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(
                        Constants.ARKTOSHI,
                    )} - New: ${Utils.BigNumber.make(supply.value).dividedBy(Constants.ARKTOSHI)}`,
                );
            }
        });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Supply Tracker.`);
    },
};
