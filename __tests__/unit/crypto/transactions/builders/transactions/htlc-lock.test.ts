import "jest-extended";

import { TransactionTypes } from "../../../../../../packages/crypto/src/enums";
import { BuilderFactory } from "../../../../../../packages/crypto/src/transactions";
import { HtlcLockBuilder } from "../../../../../../packages/crypto/src/transactions/builders/transactions/htlc-lock";
import { HtlcLockExpirationType } from "../../../../../../packages/crypto/src/transactions/types/enums";
import { HtlcLockTransaction } from "../../../../../../packages/crypto/src/transactions/types/htlc-lock";
import { transactionBuilder } from "./__shared__/transaction-builder";

const { UnixTimestamp } = HtlcLockExpirationType;

let builder: HtlcLockBuilder;

beforeEach(() => {
    builder = BuilderFactory.htlcLock();
});

describe("Htlc lock Transaction", () => {
    transactionBuilder(() => builder);

    it("should have its specific properties", () => {
        expect(builder).toHaveProperty("data.type", TransactionTypes.HtlcLock);
        expect(builder).toHaveProperty("data.fee", HtlcLockTransaction.staticFee());
        expect(builder).toHaveProperty("data.asset", {});
    });

    describe("htlcLockAsset", () => {
        it("should set the htlc lock asset", () => {
            const htlcLockAsset = {
                secretHash: "0f128d401958b1b30ad0d10406f47f9489321017b4614e6cb993fc63913c5454",
                expiration: {
                    type: UnixTimestamp,
                    value: Math.floor(Date.now() / 1000),
                },
            };

            builder.htlcLockAsset(htlcLockAsset);

            expect(builder.data.asset.lock).toEqual(htlcLockAsset);
        });
    });

    describe("verify", () => {
        const htlcLockAsset = {
            secretHash: "0f128d401958b1b30ad0d10406f47f9489321017b4614e6cb993fc63913c5454",
            expiration: {
                type: UnixTimestamp,
                value: Math.floor(Date.now() / 1000),
            },
        };
        const address = "AVzsSFwicz5gYLqCzZNL8N1RztkWQSMovK";

        it("should be valid with a signature", () => {
            const actual = builder
                .recipientId(address)
                .htlcLockAsset(htlcLockAsset)
                .amount("1")
                .sign("dummy passphrase");

            expect(actual.build().verified).toBeTrue();
            expect(actual.verify()).toBeTrue();
        });

        it("should be valid with a second signature", () => {
            const actual = builder
                .recipientId(address)
                .htlcLockAsset(htlcLockAsset)
                .amount("1")
                .sign("dummy passphrase")
                .secondSign("dummy passphrase");

            expect(actual.build().verified).toBeTrue();
            expect(actual.verify()).toBeTrue();
        });
    });
});