import { deserializer } from "../../../../packages/crypto/src/blocks/deserializer";
import { Serializer } from "../../../../packages/crypto/src/blocks/serializer";
import { configManager } from "../../../../packages/crypto/src/managers";
import { dummyBlock2, dummyBlock3 } from "../fixtures/block";

//      block processor
// import { Blocks, Identities } from "../../../../packages/crypto/src";
// beforeAll(() => {
//     // console.dir(Blocks.BlockFactory.make(dummyBlock, Identities.Keys.fromPassphrase("passphrase")));
//     // const feeObj = Utils.FeeHelper.getFeeObject(dummyBlock.removedFee);
//     // console.log(feeObj);
//     // Blocks.BlockFactory.make(dummyBlock3, Identities.Keys.fromPassphrase("passphrase"));
//     // console.log(dummyBlock3);
// });

describe("block deserializer", () => {
    describe("deserialize", () => {
        it("should get block id from outlook table", () => {
            const outlookTableBlockId = "123456";
            configManager.set("exceptions.outlookTable", { [dummyBlock3.id]: outlookTableBlockId });

            const deserialized = deserializer.deserialize(Serializer.serialize(dummyBlock3).toString("hex"), true).data;

            expect(deserialized.id).toEqual(outlookTableBlockId);

            configManager.set("exceptions.outlookTable", {});
        });

        it("should correctly deserialize a block", () => {
            const deserialized = deserializer.deserialize(dummyBlock2.serializedFull).data;

            // Serializers
            // console.log(Serializer.serialize(dummyBlock).toString("hex"));
            // console.log(Serializer.serializeWithTransactions(dummyBlock).toString("hex"));

            const blockFields = [
                "id",
                "timestamp",
                "version",
                "height",
                "previousBlock",
                "numberOfTransactions",
                "totalAmount",
                "totalFee",
                "removedFee",
                "reward",
                "topReward",
                "payloadLength",
                "payloadHash",
                "generatorPublicKey",
                "blockSignature",
            ];

            for (const field of blockFields) {
                expect(deserialized[field].toString()).toEqual(dummyBlock2.data[field].toString());
            }

            expect(deserialized.transactions).toHaveLength(dummyBlock2.data.transactions.length);

            const transactionFields = [
                "id",
                "type",
                "timestamp",
                "senderPublicKey",
                "fee",
                "amount",
                "recipientId",
                "signature",
            ];

            for (const tx of deserialized.transactions) {
                const dummyBlockTx = dummyBlock2.data.transactions.find(dummyTx => dummyTx.id === tx.id);
                expect(dummyBlockTx).toBeDefined();
                for (const field of transactionFields) {
                    expect(tx[field].toString()).toEqual(dummyBlockTx[field].toString());
                }
            }
        });
    });
});
