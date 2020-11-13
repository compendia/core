import { app } from "@arkecosystem/core-container";

import { Database, Shared } from "@arkecosystem/core-interfaces";
import { roundCalculator } from "@arkecosystem/core-utils";
import { Interfaces } from "@arkecosystem/crypto";

export class BlockHelper {
    public static async getEffectiveBlockHeight(timestamp: number): Promise<number> {
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");

        const blockFromTimestamp: Interfaces.IBlockData = (await databaseService.blocksBusinessRepository.search({
            timestamp: { from: timestamp },
            limit: 1,
            orderBy: "timestamp:asc",
        })).rows[0];

        const roundFromTimestamp: Shared.IRoundInfo = roundCalculator.calculateRound(blockFromTimestamp.height);

        const nextRoundFromTimestamp: Shared.IRoundInfo = roundCalculator.calculateRound(
            roundFromTimestamp.roundHeight + roundFromTimestamp.maxDelegates,
        );

        const effectiveFromBlock: number =
            roundCalculator.calculateRound(nextRoundFromTimestamp.roundHeight + nextRoundFromTimestamp.maxDelegates)
                .roundHeight - 1;

        return effectiveFromBlock;
    }
}
