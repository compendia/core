import "jest-extended";
import "../core-database/mocks/core-container";

import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter } from "@arkecosystem/core-interfaces";
import { DatabaseService } from "../../../packages/core-database/src/database-service";
import { State } from "../../../packages/core-interfaces/src";
import { WalletManager } from "../../../packages/core-state/src/wallets";
import { Blocks, Identities, Managers, Utils } from "../../../packages/crypto/src";
import { database } from "../core-blockchain/mocks/database";
import { DatabaseConnectionStub } from "../core-database/__fixtures__/database-connection-stub";

let container;
let walletManager: State.IWalletManager;
let connection: Database.IConnection;
let emitter: EventEmitter.EventEmitter;
let databaseService: DatabaseService;
const delegates = [];

const createService = () => {
    const service = new DatabaseService({}, connection, walletManager, undefined, undefined, undefined, undefined);
    service.emitter = emitter;

    return service;
};

beforeAll(() => {
    jest.restoreAllMocks();
    databaseService = createService();

    container = app;
    connection = new DatabaseConnectionStub();
    // @ts-ignore

    emitter = container.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");
});

describe("Top Rewards", () => {
    walletManager = new WalletManager();
    Managers.configManager.setFromPreset("devnet");
    Managers.configManager.setHeight(1);
    for (let i = 0; i < 51; i++) {
        delegates[i] = walletManager.findByPublicKey(Identities.Keys.fromPassphrase("passphrase" + i).publicKey);
    }

    const data = {
        version: 0,
        timestamp: 111150,
        height: 1000,
        previousBlockHex: "0000000000002f5b",
        previousBlock: "12123",
        numberOfTransactions: 0,
        totalAmount: Utils.BigNumber.make(0),
        totalFee: Utils.BigNumber.make(0),
        removedFee: Utils.BigNumber.make(0),
        reward: Utils.BigNumber.make(400000000),
        topReward: Utils.BigNumber.make(15000000),
        payloadLength: 1,
        payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        generatorPublicKey: delegates[7].publicKey,
        blockSignature:
            "304402205594c40825dca94912b5f7e1bcfcd99532c014f46eea9d99641bda6349f621830220774ebdb48ae9ad515026ca4b16a08f926bbe5277b9db778dfb4af94c4dd6ac0a",
        idHex: "facf7a880339ffcf",
        id: "18072798554249363407",
        transactions: [],
    };

    it("should applyBlock and forge top rewards", async () => {
        jest.spyOn(emitter, "emit");

        jest.spyOn(walletManager, "loadActiveDelegateList").mockImplementation(roundInfo => {
            return delegates;
        });

        jest.spyOn(database, "getActiveDelegates").mockImplementation(() => {
            return delegates;
        });

        databaseService = createService();
        const block1 = Blocks.BlockFactory.make(data, Identities.Keys.fromPassphrase("passphrase7"));

        await databaseService.applyBlock(block1);

        const forgingDelegates = database.getActiveDelegates();
        const individualReward = data.topReward.dividedBy(5);

        expect(individualReward).toEqual(Utils.BigNumber.make(3000000));

        for (let i = 0; i < 5; i++) {
            const topDelegate = walletManager.findByPublicKey(forgingDelegates[i].publicKey);
            expect(topDelegate.forgedTopRewards).toEqual(individualReward);
        }
        const notTopDelegate = walletManager.findByPublicKey(forgingDelegates[7].publicKey);
        expect(notTopDelegate.forgedTopRewards).toEqual(Utils.BigNumber.ZERO);
    });
});
