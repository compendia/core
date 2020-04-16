import { Managers, Utils } from "@arkecosystem/crypto";
import got from "got";

import { secrets } from "../../../__tests__/utils/config/testnet/delegates.json";
import { TransactionFactory as StakeTransactionFactory } from "./__functional__/factory";
import * as support from "./__support__";

beforeAll(support.setUp);
afterAll(support.tearDown);

describe("Transaction Forging - Stake create", () => {
    describe("Signed with 1 Passphrase", () => {
        it("should create, halve, and redeem a stake", async () => {
            let wallet;

            Managers.configManager.setFromPreset("nospluginnet");

            const stakeCreate = StakeTransactionFactory.stakeCreate(20, Utils.BigNumber.make(10_000).times(1e8))
                .withPassphrase(secrets[0])
                .createOne();

            await support.snoozeForBlock(1);

            // Block 3
            await expect(stakeCreate).toBeAccepted();

            await support.snoozeForBlock(1);
            await expect(stakeCreate.id).toBeForged();
            wallet = await got.get("http://localhost:4003/api/v2/wallets/ANBkoGqWeTSiaEVgVzSKZd3jS7UWzv9PSo");
            expect(JSON.parse(wallet.body).data.stakePower).toBe("0");

            await support.snoozeForBlock(1);

            // Round 2
            wallet = await got.get("http://localhost:4003/api/v2/wallets/ANBkoGqWeTSiaEVgVzSKZd3jS7UWzv9PSo");
            expect(JSON.parse(wallet.body).data.stakePower).toBe("2000000000000");

            const stakeRedeem = StakeTransactionFactory.stakeRedeem(stakeCreate.id)
                .withPassphrase(secrets[0])
                .createOne();
            await expect(stakeRedeem).toBeRejected();

            await support.snoozeForBlock(2);

            // Block 6
            wallet = await got.get("http://localhost:4003/api/v2/wallets/ANBkoGqWeTSiaEVgVzSKZd3jS7UWzv9PSo");
            expect(JSON.parse(wallet.body).data.stakes[stakeCreate.id].halved).toBeTrue();
            expect(JSON.parse(wallet.body).data.stakePower).toBe("1000000000000");

            const stakeRedeem2 = StakeTransactionFactory.stakeRedeem(stakeCreate.id)
                .withPassphrase(secrets[0])
                .createOne();

            await expect(stakeRedeem2).toBeAccepted();
            await support.snoozeForBlock(1);

            // Block 7
            wallet = await got.get("http://localhost:4003/api/v2/wallets/ANBkoGqWeTSiaEVgVzSKZd3jS7UWzv9PSo");

            expect(JSON.parse(wallet.body).data.stakes[stakeCreate.id].redeemed).toBeTrue();

            await expect(stakeRedeem2.id).toBeForged();
            wallet = await got.get("http://localhost:4003/api/v2/wallets/ANBkoGqWeTSiaEVgVzSKZd3jS7UWzv9PSo");
            expect(JSON.parse(wallet.body).data.stakePower).toBe("0");

            const stakeRedeem3 = StakeTransactionFactory.stakeRedeem(stakeCreate.id)
                .withPassphrase(secrets[0])
                .createOne();
            await expect(stakeRedeem3).toBeRejected();
        });
    });
});
