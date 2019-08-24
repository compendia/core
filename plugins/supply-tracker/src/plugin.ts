import { app } from "@arkecosystem/core-container";
import { Container, EventEmitter, Logger } from "@arkecosystem/core-interfaces";
import { Interfaces, Utils } from "@arkecosystem/crypto";
import { Constants } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { StakeHelpers } from "@nosplatform/stake-transactions";
import { asValue } from "awilix";
import { defaults } from "./defaults";

const logger = app.resolvePlugin<Logger.ILogger>("logger");
const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

export const plugin: Container.IPluginDescriptor = {
    pkg: require("../package.json"),
    defaults,
    alias: "supply-tracker",
    async register(container: Container.IContainer, options) {
        logger.info(`Registering Supply Tracker.`);
        // On new block
        emitter.on("block.forged", block => {
            const blockData: Interfaces.IBlockData = block;
            if (app.has("supply")) {
                console.log("Supply: " + app.resolve("supply"));
                const lastSupply: Utils.BigNumber = app.resolve("supply");
                let supply = lastSupply;
                supply = supply
                    .plus(blockData.totalFee)
                    .plus(blockData.reward)
                    .plus(blockData.topReward)
                    .minus(blockData.removedFee);
                app.register("supply", asValue(supply));
                logger.info(
                    `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${supply.dividedBy(
                        Constants.ARKTOSHI,
                    )}`,
                );
            } else {
                const genesisBlock = app.getConfig().all().genesisBlock;
                app.register("supply", asValue(Utils.BigNumber.make(genesisBlock.totalAmount)));
            }
        });

        // On stake create
        emitter.on("stake.created", tx => {
            const o: StakeInterfaces.IStakeObject = StakeHelpers.VoteWeight.stakeObject(tx);
            const lastSupply: Utils.BigNumber = app.resolve("supply");

            const supply = lastSupply.minus(o.amount);

            let stakeTotal: Utils.BigNumber;

            if (!app.has("stake.total")) {
                stakeTotal = o.amount;
            } else {
                stakeTotal = app.resolve("stake.total");
                stakeTotal = stakeTotal.plus(o.amount);
            }

            app.register("supply", asValue(supply));
            app.register("stake.total", asValue(stakeTotal));
            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${supply.dividedBy(
                    Constants.ARKTOSHI,
                )}`,
            );
        });

        // On stake create
        emitter.on("stake.expired", stakeObj => {
            const walletManager = app.resolvePlugin("database").walletManager;
            const sender = walletManager.findByPublicKey(stakeObj.publicKey);
            const blockTime = stakeObj.stakeKey;
            const stake: StakeInterfaces.IStakeObject = sender.stake[blockTime];

            const lastSupply: Utils.BigNumber = app.resolve("supply");
            const supply = lastSupply.plus(stake.amount);

            let totalStake: Utils.BigNumber = app.resolve("stake.total");
            totalStake = totalStake.minus(stake.amount);

            app.register("supply", asValue(supply));
            app.register("stake.total", asValue(totalStake));

            logger.info(
                `Supply updated. Previous: ${lastSupply.dividedBy(Constants.ARKTOSHI)} - New: ${supply.dividedBy(
                    Constants.ARKTOSHI,
                )}`,
            );
        });
    },
    async deregister(container: Container.IContainer, options) {
        logger.info(`Deregistering Supply Tracker.`);
    },
};
