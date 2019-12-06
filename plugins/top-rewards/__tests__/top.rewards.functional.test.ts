import { app } from "@arkecosystem/core-container";
import { Database } from "@arkecosystem/core-interfaces";
import { Managers, Utils } from "@arkecosystem/crypto";
import got from "got";

import * as support from "./__support__";

beforeAll(support.setUp);
afterAll(support.tearDown);

describe("Blockchain - Top Rewards", () => {
    describe("Signed with 1 Passphrase", () => {
        it("should handle top rewards for a number of blocks", async () => {
            Managers.configManager.setFromPreset("nospluginnet");
            const delegateData = await got.get("http://localhost:4003/api/v2/delegates");
            const delegatesApi = JSON.parse(delegateData.body).data;
            // let delegateData;
            // const topDelegatesNum = Managers.configManager.getMilestone().topDelegates;
            // const db = app.resolvePlugin<State.IStateService>("state");
            const dbs = app.resolvePlugin<Database.IDatabaseService>("database");

            const delegate1 = dbs.walletManager.findByPublicKey(delegatesApi[0].publicKey);
            const delegate2 = dbs.walletManager.findByPublicKey(delegatesApi[1].publicKey);
            const delegate10 = dbs.walletManager.findByPublicKey(delegatesApi[10].publicKey);
            const delegates = [delegate1, delegate2];
            const oldBalance = Utils.BigNumber.make(JSON.parse(JSON.stringify(delegate1.balance)));

            await support.snoozeForBlock(1.5);

            expect(delegates[0].getAttribute("delegate.forgedTopRewards").toString()).toBe("50000000");

            await support.snoozeForBlock(1);

            expect(delegate1.getAttribute("delegate.forgedTopRewards").toString()).toBe("100000000");
            expect(delegate1.getAttribute("delegate.voteBalance").toString()).toBe(delegate1.balance.toString());
            expect(delegate10.getAttribute("delegate.forgedTopRewards").toString()).toBe("0");
            expect(delegate1.balance.minus(oldBalance).toString()).toBe(
                delegate1
                    .getAttribute("delegate.forgedTopRewards")
                    .plus(delegate1.getAttribute("delegate.forgedRewards"))
                    .plus(delegate1.getAttribute("delegate.forgedFees"))
                    .toString(),
            );

            await support.snoozeForBlock(1);
        });
    });
});
