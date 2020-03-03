import "../mocks/";
import { blockchain } from "../mocks/blockchain";
import { database } from "../mocks/database";

import { Blocks, Managers, Utils } from "@arkecosystem/crypto";
import { BlockProcessor, BlockProcessorResult } from "../../../../packages/core-blockchain/src/processor";
import * as handlers from "../../../../packages/core-blockchain/src/processor/handlers";
import { fixtures } from "../../../utils";
import { genesisBlock } from "../../../utils/config/testnet/genesisBlock";

const { BlockFactory } = Blocks;
const { delegates } = fixtures;

let blockProcessor: BlockProcessor;

beforeAll(async () => {
    blockProcessor = new BlockProcessor(blockchain as any);
    Managers.configManager.setHeight(2); // aip11 (v2 transactions) is true from height 2 on testnet
});

describe("Block processor", () => {
    const blockTemplate = {
        id: "17882607875259085966",
        version: 0,
        timestamp: 46583330,
        height: 2,
        reward: Utils.BigNumber.make(0),
        previousBlock: genesisBlock.id,
        numberOfTransactions: 0,
        transactions: [],
        totalAmount: Utils.BigNumber.make(0),
        totalFee: Utils.BigNumber.make(0),
        removedFee: Utils.BigNumber.make(0),
        payloadLength: 0,
        payloadHash: genesisBlock.payloadHash,
        generatorPublicKey: delegates[0].publicKey,
        blockSignature:
            "3045022100e7385c6ea42bd950f7f6ab8c8619cf2f66a41d8f8f185b0bc99af032cb25f30d02200b6210176a6cedfdcbe483167fd91c21d740e0e4011d24d679c601fdd46b0de9",
        createdAt: "2019-07-11T16:48:50.550Z",
    };

    describe("process", () => {
        const getBlock = transactions => ({
            ...blockTemplate,
            ...{
                transactions,
                totalAmount: transactions.reduce((acc, curr) => Utils.BigNumber.make(acc).plus(curr.amount), 0),
                totalFee: transactions.reduce((acc, curr) => Utils.BigNumber.make(acc).plus(curr.fee), 0),
                numberOfTransactions: transactions.length,
            },
        });

        describe("Forging delegates", () => {
            let block;
            beforeEach(() => {
                const lastBlock = BlockFactory.fromData(getBlock([]));

                block = getBlock([]);
                block.height = 3;
                block.previousBlock = lastBlock.data.id;
                block.timestamp += 1000;

                jest.spyOn(blockchain, "getLastBlock").mockReturnValue(lastBlock);
            });
            afterEach(() => {
                jest.restoreAllMocks();
            });

            it("should use InvalidRewardHandler if non-top delegate forges with topReward ", async () => {
                Managers.configManager.getMilestone().reward = 2 * 1e8;
                Managers.configManager.getMilestone().topReward = 4 * 1e8;
                Managers.configManager.getMilestone().topDelegates = 3;

                const blockVerified = BlockFactory.fromData(block);
                const delegateMock = {
                    applyBlock: jest.fn(),
                    revertBlock: jest.fn(),
                    publicKey: blockVerified.data.generatorPublicKey,
                    isDelegate: () => true,
                    getAttribute: val => (val === "delegate.rank" ? 6 : "username"),
                };

                // @ts-ignore
                jest.spyOn(database.walletManager, "findByPublicKey").mockReturnValue(delegateMock);

                blockVerified.verification.verified = true;
                blockVerified.data.reward = Utils.BigNumber.make(4 * 1e8);

                const handler = await blockProcessor.getHandler(blockVerified);
                expect(handler instanceof handlers.InvalidRewardHandler).toBeTrue();

                const result = await blockProcessor.process(blockVerified);
                expect(result).toBe(BlockProcessorResult.Rejected);

                Managers.configManager.getMilestone().reward = 0;
                Managers.configManager.getMilestone().topReward = 0;
            });

            it("should use InvalidRewardHandler if top delegate forges with non-topReward ", async () => {
                Managers.configManager.getMilestone().reward = 2 * 1e8;
                Managers.configManager.getMilestone().topReward = 4 * 1e8;
                Managers.configManager.getMilestone().topDelegates = 3;

                const blockVerified = BlockFactory.fromData(block);
                const delegateMock = {
                    applyBlock: jest.fn(),
                    revertBlock: jest.fn(),
                    publicKey: blockVerified.data.generatorPublicKey,
                    isDelegate: () => true,
                    getAttribute: val => (val === "delegate.rank" ? 1 : "username"),
                };

                // @ts-ignore
                jest.spyOn(database.walletManager, "findByPublicKey").mockReturnValue(delegateMock);

                blockVerified.verification.verified = true;
                blockVerified.data.reward = Utils.BigNumber.make(2 * 1e8);

                const handler = await blockProcessor.getHandler(blockVerified);
                expect(handler instanceof handlers.InvalidRewardHandler).toBeTrue();

                const result = await blockProcessor.process(blockVerified);
                expect(result).toBe(BlockProcessorResult.Rejected);

                Managers.configManager.getMilestone().reward = 0;
                Managers.configManager.getMilestone().topReward = 0;
            });

            it("should accept block if top delegate forges with topReward ", async () => {
                Managers.configManager.getMilestone().reward = 2 * 1e8;
                Managers.configManager.getMilestone().topReward = 4 * 1e8;
                Managers.configManager.getMilestone().topDelegates = 3;

                const blockVerified = BlockFactory.fromData(block);
                const delegateMock = {
                    applyBlock: jest.fn(),
                    revertBlock: jest.fn(),
                    publicKey: blockVerified.data.generatorPublicKey,
                    isDelegate: () => true,
                    getAttribute: val => (val === "delegate.rank" ? 1 : "username"),
                };

                // @ts-ignore
                jest.spyOn(database.walletManager, "findByPublicKey").mockReturnValue(delegateMock);

                blockVerified.verification.verified = true;
                blockVerified.data.reward = Utils.BigNumber.make(4 * 1e8);

                const result = await blockProcessor.process(blockVerified);
                expect(result).toBe(BlockProcessorResult.Accepted);

                Managers.configManager.getMilestone().reward = 0;
                Managers.configManager.getMilestone().topReward = 0;
                // Managers.configManager.getMilestone = backup;
            });

            it("should accept block if non-top delegate forges with regular reward ", async () => {
                Managers.configManager.getMilestone().reward = 2 * 1e8;
                Managers.configManager.getMilestone().topReward = 4 * 1e8;
                Managers.configManager.getMilestone().topDelegates = 3;

                const blockVerified = BlockFactory.fromData(block);
                const delegateMock = {
                    applyBlock: jest.fn(),
                    revertBlock: jest.fn(),
                    publicKey: blockVerified.data.generatorPublicKey,
                    isDelegate: () => true,
                    getAttribute: val => (val === "delegate.rank" ? 7 : "username"),
                };

                // @ts-ignore
                jest.spyOn(database.walletManager, "findByPublicKey").mockReturnValue(delegateMock);

                blockVerified.verification.verified = true;
                blockVerified.data.reward = Utils.BigNumber.make(2 * 1e8);

                const result = await blockProcessor.process(blockVerified);
                expect(result).toBe(BlockProcessorResult.Accepted);
            });
        });
    });
});
