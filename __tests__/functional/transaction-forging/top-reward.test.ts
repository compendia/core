// import { app } from "@arkecosystem/core-container";
// import { Database } from "@arkecosystem/core-interfaces";
import { Managers, Utils } from "@arkecosystem/crypto";
import got from "got";

import * as support from "./__support__/nospluginnet";

beforeAll(support.setUp);
afterAll(support.tearDown);

describe("Blockchain - Top Rewards", () => {
    it("should handle top rewards for a number of blocks", async () => {
        Managers.configManager.setFromPreset("nospluginnet");
        let delegateData = await got.get("http://localhost:4003/api/v2/delegates");
        let delegatesApi = JSON.parse(delegateData.body).data;
        // let delegateData;
        // const topDelegatesNum = Managers.configManager.getMilestone().topDelegates;
        // const db = app.resolvePlugin<State.IStateService>("state");
        // const dbs = app.resolvePlugin<Database.IDatabaseService>("database");

        let delegate1Response = await got.get("http://localhost:4003/api/v2/wallets/" + delegatesApi[0].username);
        let delegate2Response = await got.get("http://localhost:4003/api/v2/wallets/" + delegatesApi[2].username);
        let delegate1 = JSON.parse(delegate1Response.body).data;
        let delegate2 = JSON.parse(delegate2Response.body).data;
        expect(delegate1.balance).toBe("245100000000000");
        // expect(delegates[1].balance.toString()).toBe("245098000000000");
        expect(delegate2.balance).toBe("245098000000000");

        // Full round to make sure both nodes forged at least once
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock();
        await support.snoozeForBlock(0.5);

        delegateData = await got.get("http://localhost:4003/api/v2/delegates");
        delegatesApi = JSON.parse(delegateData.body).data;
        delegate1Response = await got.get("http://localhost:4003/api/v2/wallets/" + delegatesApi[0].username);
        delegate2Response = await got.get("http://localhost:4003/api/v2/wallets/" + delegatesApi[2].username);
        delegate1 = JSON.parse(delegate1Response.body).data;
        delegate2 = JSON.parse(delegate2Response.body).data;
        // // Nodes can have forged a block once or twice, so expect either 1x or 2x topRewards (delegate1) and regular rewards (delegate2) to be awarded
        expect(delegate1.balance).toBeOneOf([
            Utils.BigNumber.make("245100000000000")
                .plus("400000000")
                .toString(),
            Utils.BigNumber.make("245100000000000")
                .plus("800000000")
                .toString(),
        ]);
        expect(delegate2.balance).toBeOneOf([
            Utils.BigNumber.make("245098000000000")
                .plus("300000000")
                .toString(),
            Utils.BigNumber.make("245098000000000")
                .plus("600000000")
                .toString(),
        ]);

        await support.snoozeForBlock(0.1);
        expect(true);
    });
});
