import { deserializer } from "../../../../packages/crypto/src/blocks/deserializer";
import { Serializer } from "../../../../packages/crypto/src/blocks/serializer";
import { configManager } from "../../../../packages/crypto/src/managers";
import { dummyBlock2, dummyBlock3 } from "../fixtures/block";

//      block processor
// import { Identities, Blocks } from "../../../../packages/crypto/src";
// import { Utils } from "@arkecosystem/crypto";
// beforeAll(() => {
//        console.dir(Blocks.BlockFactory.make(dummyBlock, Identities.Keys.fromPassphrase("passphrase")));
//        const feeObj = Utils.FeeHelper.getFeeObject(dummyBlock.removedFee);
//        console.log(feeObj);
//        // console.dir(Blocks.BlockFactory.make(dummyBlock3, Identities.Keys.fromPassphrase("passphrase")).data);
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
                "payloadLength",
                "payloadHash",
                "generatorPublicKey",
                "blockSignature",
            ];
            // tslint:disable-next-line
            blockFields.forEach(field => {
                expect(deserialized[field].toString()).toEqual(dummyBlock2.data[field].toString());
            });

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
            // tslint:disable-next-line
            deserialized.transactions.forEach(tx => {
                const dummyBlockTx = dummyBlock2.data.transactions.find(dummyTx => dummyTx.id === tx.id);
                expect(dummyBlockTx).toBeDefined();
                // tslint:disable-next-line
                transactionFields.forEach(field => {
                    expect(tx[field].toString()).toEqual(dummyBlockTx[field].toString());
                });
            });
        });
    });
});
